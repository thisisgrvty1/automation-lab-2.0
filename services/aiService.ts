import { GoogleGenAI } from "@google/genai";
import OpenAI from 'openai';
import type { Conversation } from '../types';

// Get API keys from settings
const getApiKeys = () => {
    try {
        const settings = JSON.parse(localStorage.getItem('settings') || '{}');
        return {
            gemini: settings.geminiApiKey || process.env.GEMINI_API_KEY,
            openai: settings.openaiApiKey || process.env.OPENAI_API_KEY
        };
    } catch {
        return {
            gemini: process.env.GEMINI_API_KEY,
            openai: process.env.OPENAI_API_KEY
        };
    }
};

// Initialize clients dynamically
const getGeminiClient = () => {
    const apiKey = getApiKeys().gemini;
    if (!apiKey) return null;
    return new GoogleGenAI({ apiKey });
};

const getOpenAIClient = () => {
    const apiKey = getApiKeys().openai;
    if (!apiKey) return null;
    return new OpenAI({
        apiKey,
        dangerouslyAllowBrowser: true
    });
};

export const streamChat = async (conversation: Conversation) => {
    const { model } = conversation;
    if (model.startsWith('gpt-')) {
        return streamOpenAIChat(conversation);
    } else {
        const geminiClient = getGeminiClient();
        if (!geminiClient) {
            throw new Error("Gemini API key is not configured. Please use an OpenAI model instead or configure your Gemini API key.");
        }
        return streamGeminiChat(conversation, geminiClient);
    }
};

const streamGeminiChat = async (conversation: Conversation, geminiClient: GoogleGenAI) => {
    const { systemPrompt, temperature, topP, messages } = conversation;

    const chat = geminiClient.chats.create({
        model: conversation.model,
        config: {
            systemInstruction: systemPrompt,
            temperature: temperature,
            topP: topP,
        },
        history: messages.slice(0, -1)
            .filter(m => m.role === 'user' || m.role === 'model')
            .map(m => ({
                role: m.role,
                parts: [{ text: m.content }]
            }))
    });

    const lastMessage = messages[messages.length - 1];
    
    try {
        const result = await chat.sendMessageStream({ message: lastMessage.content });
        return result;
    } catch (error) {
        console.error("Error in streamGeminiChat:", error);
        throw new Error("Failed to get response from Gemini model.");
    }
};

const streamOpenAIChat = async (conversation: Conversation) => {
    const openaiClient = getOpenAIClient();
    if (!openaiClient) {
        throw new Error("OpenAI API key is not configured. Please set OPENAI_API_KEY in your environment variables.");
    }

    const { systemPrompt, temperature, topP, messages, model } = conversation;

    const openaiMessages = [
        { role: 'system' as const, content: systemPrompt },
        ...messages.map(m => ({
            role: m.role === 'model' ? 'assistant' as const : m.role as 'user' | 'system',
            content: m.content
        }))
    ];

    try {
        const stream = await openaiClient.chat.completions.create({
            model: model,
            messages: openaiMessages,
            temperature: temperature,
            top_p: topP,
            stream: true,
        });

        return {
            async *[Symbol.asyncIterator]() {
                for await (const chunk of stream) {
                    const content = chunk.choices[0]?.delta?.content;
                    if (content) {
                        yield { text: content };
                    }
                }
            }
        };
    } catch (error) {
        console.error("Error in streamOpenAIChat:", error);
        throw new Error("Failed to get response from OpenAI model.");
    }
};

export const generateImages = async (prompt: string) => {
    const geminiClient = getGeminiClient();
    if (!geminiClient) {
        throw new Error("Gemini API key is not configured for image generation.");
    }

    try {
        const response = await geminiClient.models.generateImages({
            model: 'imagen-3.0-generate-002',
            prompt: prompt,
            config: {
                numberOfImages: 4,
                outputMimeType: 'image/jpeg',
                aspectRatio: '1:1',
            },
        });
        
        return response.generatedImages.map(img => img.image.imageBytes);
    } catch (error) {
        console.error("Error in generateImages:", error);
        throw new Error("Failed to generate images.");
    }
};

export const getTitleForChat = async (firstMessage: string, model: string = 'gemini-2.5-flash') => {
    try {
        if (model.startsWith('gpt-')) {
            const openaiClient = getOpenAIClient();
            if (!openaiClient) {
                throw new Error("OpenAI API key is not configured.");
            }
            const response = await openaiClient.chat.completions.create({
                model: 'gpt-3.5-turbo',
                messages: [
                    {
                        role: 'user',
                        content: `Summarize the following user query into a short, 3-5 word title for a chat log. Do not use quotes. Query: "${firstMessage}"`
                    }
                ],
                temperature: 0.1,
                max_tokens: 20
            });
            return response.choices[0]?.message?.content?.replace(/"/g, '').trim() || "New Chat";
        } else {
            const geminiClient = getGeminiClient();
            if (!geminiClient) {
                // Fallback to OpenAI if Gemini is not available
                const openaiClient = getOpenAIClient();
                if (openaiClient) {
                    const response = await openaiClient.chat.completions.create({
                        model: 'gpt-3.5-turbo',
                        messages: [
                            {
                                role: 'user',
                                content: `Summarize the following user query into a short, 3-5 word title for a chat log. Do not use quotes. Query: "${firstMessage}"`
                            }
                        ],
                        temperature: 0.1,
                        max_tokens: 20
                    });
                    return response.choices[0]?.message?.content?.replace(/"/g, '').trim() || "New Chat";
                }
                return "New Chat";
            }
            const response = await geminiClient.models.generateContent({
                model: model,
                contents: `Summarize the following user query into a short, 3-5 word title for a chat log. Do not use quotes. Query: "${firstMessage}"`,
                config: {
                    temperature: 0.1,
                }
            });
            return response.text.replace(/"/g, '').trim();
        }
    } catch (error) {
        console.error("Error generating title:", error);
        return "New Chat";
    }
};

export const postToWebhook = async (url: string, message: string, apiKey: string) => {
    if (!apiKey) {
        throw new Error("Make.com API key is not configured. Please set it in Settings.");
    }

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-make-apikey': apiKey
            },
            body: JSON.stringify({ text: message }),
        });

        if (!response.ok) {
            if (response.status === 401) {
                throw new Error("Authentication failed (401). Please check that your Make.com API key in Settings is correct and valid for the webhook URL.");
            }
            const statusText = response.statusText || 'An error occurred';
            throw new Error(`Webhook request failed: ${response.status} ${statusText}`);
        }

        const responseText = await response.text();

        if (!responseText) {
            return "Workflow executed successfully (no content returned).";
        }
        
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            try {
                const jsonResponse = JSON.parse(responseText);
                return jsonResponse.text || JSON.stringify(jsonResponse, null, 2);
            } catch (error) {
                return responseText;
            }
        }
        
        return responseText;

    } catch (error) {
        console.error("Error posting to webhook:", error);
        if (error instanceof Error) {
            throw error;
        }
        throw new Error("An unknown error occurred while contacting the workflow.");
    }
};