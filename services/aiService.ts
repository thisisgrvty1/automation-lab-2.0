import { GoogleGenAI } from "@google/genai";
import OpenAI from 'openai';
import type { Conversation } from '../types';

// Memoized API key getter to avoid repeated localStorage access
let cachedApiKeys: { gemini?: string; openai?: string } | null = null;
let lastCacheTime = 0;
const CACHE_DURATION = 5000; // 5 seconds

const getApiKeys = () => {
    const now = Date.now();
    if (cachedApiKeys && (now - lastCacheTime) < CACHE_DURATION) {
        return cachedApiKeys;
    }

    try {
        const settings = JSON.parse(localStorage.getItem('settings') || '{}');
        cachedApiKeys = {
            gemini: settings.geminiApiKey || process.env.GEMINI_API_KEY,
            openai: settings.openaiApiKey || process.env.OPENAI_API_KEY
        };
        lastCacheTime = now;
        return cachedApiKeys;
    } catch {
        cachedApiKeys = {
            gemini: process.env.GEMINI_API_KEY,
            openai: process.env.OPENAI_API_KEY
        };
        lastCacheTime = now;
        return cachedApiKeys;
    }
};

// Memoized client instances
let geminiClientCache: GoogleGenAI | null = null;
let openaiClientCache: OpenAI | null = null;
let lastGeminiKey = '';
let lastOpenAIKey = '';

const getGeminiClient = () => {
    const apiKey = getApiKeys().gemini;
    if (!apiKey) {
        geminiClientCache = null;
        return null;
    }
    
    // Only create new client if API key changed
    if (geminiClientCache && lastGeminiKey === apiKey) {
        return geminiClientCache;
    }
    
    try {
        geminiClientCache = new GoogleGenAI({ apiKey });
        lastGeminiKey = apiKey;
        return geminiClientCache;
    } catch (error) {
        console.error('Failed to initialize Gemini client:', error);
        return null;
    }
};

const getOpenAIClient = () => {
    const apiKey = getApiKeys().openai;
    if (!apiKey) {
        openaiClientCache = null;
        return null;
    }
    
    // Only create new client if API key changed
    if (openaiClientCache && lastOpenAIKey === apiKey) {
        return openaiClientCache;
    }
    
    try {
        openaiClientCache = new OpenAI({
            apiKey,
            dangerouslyAllowBrowser: true
        });
        lastOpenAIKey = apiKey;
        return openaiClientCache;
    } catch (error) {
        console.error('Failed to initialize OpenAI client:', error);
        return null;
    }
};

// Clear cache when API keys change
export const clearApiKeyCache = () => {
    cachedApiKeys = null;
    lastCacheTime = 0;
    geminiClientCache = null;
    openaiClientCache = null;
    lastGeminiKey = '';
    lastOpenAIKey = '';
};

export const streamChat = async (conversation: Conversation) => {
    const { model } = conversation;
    
    if (!model) {
        throw new Error("No model specified in conversation");
    }
    
    if (model.startsWith('gpt-')) {
        return streamOpenAIChat(conversation);
    } else if (model.startsWith('gemini-')) {
        const geminiClient = getGeminiClient();
        if (!geminiClient) {
            throw new Error("Gemini API key is not configured. Please configure your Gemini API key in Settings.");
        }
        return streamGeminiChat(conversation, geminiClient);
    } else {
        throw new Error(`Unsupported model: ${model}`);
    }
};

const streamGeminiChat = async (conversation: Conversation, geminiClient: GoogleGenAI) => {
    const { systemPrompt, temperature, topP, messages } = conversation;

    if (!messages.length) {
        throw new Error("No messages to send");
    }

    const lastMessage = messages[messages.length - 1];
    if (!lastMessage.content.trim()) {
        throw new Error("Cannot send empty message");
    }

    // Prepare conversation history (exclude the last message)
    const history = messages.slice(0, -1)
        .filter(m => m.role === 'user' || m.role === 'model')
        .map(m => ({
            role: m.role,
            parts: [{ text: m.content }]
        }));
    
    try {
        const chat = geminiClient.chats.create({
            model: model,
            config: {
                systemInstruction: systemPrompt,
                temperature: Math.max(0, Math.min(1, temperature)),
                topP: Math.max(0, Math.min(1, topP)),
            },
            history: history
        });

        const result = await chat.sendMessageStream({ message: lastMessage.content });
        return result;
    } catch (error) {
        console.error("Error in streamGeminiChat:", error);
        if (error instanceof Error) {
            throw new Error(`Gemini API error: ${error.message}`);
        }
        throw new Error("Failed to get response from Gemini model");
    }
};

const streamOpenAIChat = async (conversation: Conversation) => {
    const openaiClient = getOpenAIClient();
    if (!openaiClient) {
        throw new Error("OpenAI API key is not configured. Please configure your OpenAI API key in Settings.");
    }

    const { systemPrompt, temperature, topP, messages, model } = conversation;

    if (!messages.length) {
        throw new Error("No messages to send");
    }

    // Validate model
    const validOpenAIModels = ['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'];
    if (!validOpenAIModels.includes(model)) {
        throw new Error(`Invalid OpenAI model: ${model}`);
    }

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
            temperature: Math.max(0, Math.min(2, temperature)),
            top_p: Math.max(0, Math.min(1, topP)),
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
        if (error instanceof Error) {
            throw new Error(`OpenAI API error: ${error.message}`);
        }
        throw new Error("Failed to get response from OpenAI model");
    }
};

export const generateImages = async (prompt: string) => {
    const geminiClient = getGeminiClient();
    if (!geminiClient) {
        throw new Error("Gemini API key is not configured. Please configure your Gemini API key in Settings for image generation.");
    }

    if (!prompt.trim()) {
        throw new Error("Image prompt cannot be empty");
    }

    try {
        const response = await geminiClient.models.generateImages({
            model: 'imagen-3.0-generate-002',
            prompt: prompt.trim(),
            config: {
                numberOfImages: 1,
                outputMimeType: 'image/jpeg',
                aspectRatio: '1:1',
            },
        });
        
        if (!response.generatedImages || response.generatedImages.length === 0) {
            throw new Error("No images were generated");
        }
        
        return response.generatedImages.map(img => img.image.imageBytes);
    } catch (error) {
        console.error("Error in generateImages:", error);
        if (error instanceof Error) {
            throw new Error(`Image generation error: ${error.message}`);
        }
        throw new Error("Failed to generate images");
    }
};

export const getTitleForChat = async (firstMessage: string, model: string = 'gemini-2.5-flash') => {
    if (!firstMessage.trim()) {
        return "New Chat";
    }

    const truncatedMessage = firstMessage.trim().slice(0, 200); // Limit input length
    
    try {
        if (model.startsWith('gpt-')) {
            const openaiClient = getOpenAIClient();
            if (!openaiClient) {
                return "New Chat";
            }
            const response = await openaiClient.chat.completions.create({
                model: 'gpt-3.5-turbo',
                messages: [
                    {
                        role: 'user',
                        content: `Summarize the following user query into a short, 3-5 word title for a chat log. Do not use quotes. Query: "${truncatedMessage}"`
                    }
                ],
                temperature: 0.1,
                max_tokens: 20
            });
            const title = response.choices[0]?.message?.content?.replace(/['"]/g, '').trim();
            return title && title.length > 0 ? title : "New Chat";
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
                                content: `Summarize the following user query into a short, 3-5 word title for a chat log. Do not use quotes. Query: "${truncatedMessage}"`
                            }
                        ],
                        temperature: 0.1,
                        max_tokens: 20
                    });
                    const title = response.choices[0]?.message?.content?.replace(/['"]/g, '').trim();
                    return title && title.length > 0 ? title : "New Chat";
                }
                return "New Chat";
            }
            const response = await geminiClient.models.generateContent({
                model: model,
                contents: `Summarize the following user query into a short, 3-5 word title for a chat log. Do not use quotes. Query: "${truncatedMessage}"`,
                config: {
                    temperature: 0.1,
                }
            });
            const title = response.text.replace(/['"]/g, '').trim();
            return title && title.length > 0 ? title : "New Chat";
        }
    } catch (error) {
        console.error("Error generating title:", error);
        return "New Chat";
    }
};

export const postToWebhook = async (url: string, message: string, apiKey: string) => {
    if (!apiKey) {
        throw new Error("Make.com API key is not configured. Please configure it in Settings.");
    }

    if (!url.trim()) {
        throw new Error("Webhook URL cannot be empty");
    }

    if (!message.trim()) {
        throw new Error("Message cannot be empty");
    }

    // Validate URL format
    try {
        new URL(url);
    } catch {
        throw new Error("Invalid webhook URL format");
    }

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

        const response = await fetch(url.trim(), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-make-apikey': apiKey.trim()
            },
            body: JSON.stringify({ text: message.trim() }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            if (response.status === 401) {
                throw new Error("Authentication failed. Please check your Make.com API key in Settings.");
            }
            if (response.status === 404) {
                throw new Error("Webhook not found. Please check the webhook URL.");
            }
            throw new Error(`Webhook request failed: ${response.status} ${response.statusText}`);
        }

        const responseText = await response.text();

        if (!responseText) {
            return "Workflow executed successfully (no content returned)";
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
            if (error.name === 'AbortError') {
                throw new Error("Webhook request timed out after 30 seconds");
            }
            throw error;
        }
        
        if (error instanceof Error) {
            throw error;
        }
        throw new Error("An unknown error occurred while contacting the workflow");
    }
};