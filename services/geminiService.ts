
import { GoogleGenAI } from "@google/genai";
import type { Conversation } from '../types';

if (!process.env.API_KEY) {
    throw new Error("API_KEY environment variable is not set or is empty. Please provide a valid Google Gemini API key.");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const streamChat = async (conversation: Conversation) => {
    const { systemPrompt, temperature, topP, messages } = conversation;

    const chat = ai.chats.create({
        model: 'gemini-2.5-flash',
        config: {
            systemInstruction: systemPrompt,
            temperature: temperature,
            topP: topP,
        },
        // Pass previous messages, filtering for valid roles and mapping to the correct format.
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
        console.error("Error in streamChat:", error);
        throw new Error("Failed to get response from AI model.");
    }
};

export const generateImages = async (prompt: string) => {
    try {
        const response = await ai.models.generateImages({
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

export const getTitleForChat = async (firstMessage: string) => {
    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Summarize the following user query into a short, 3-5 word title for a chat log. Do not use quotes. Query: "${firstMessage}"`,
            config: {
                temperature: 0.1,
            }
        });
        return response.text.replace(/"/g, '').trim();
    } catch (error) {
        console.error("Error generating title:", error);
        return "New Chat";
    }
}

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
            // Provide a more descriptive error for 401 Unauthorized status
            if (response.status === 401) {
                throw new Error("Authentication failed (401). Please check that your Make.com API key in Settings is correct and valid for the webhook URL.");
            }
            const statusText = response.statusText || 'An error occurred';
            throw new Error(`Webhook request failed: ${response.status} ${statusText}`);
        }

        const responseText = await response.text();

        // Handle empty response body, which is a valid case for webhooks.
        if (!responseText) {
            return "Workflow executed successfully (no content returned).";
        }
        
        const contentType = response.headers.get('content-type');
        // If the content type indicates JSON, try to parse it.
        if (contentType && contentType.includes('application/json')) {
            try {
                const jsonResponse = JSON.parse(responseText);
                // Prefer the 'text' property if it exists, otherwise stringify the whole object.
                return jsonResponse.text || JSON.stringify(jsonResponse, null, 2);
            } catch (error) {
                // If JSON parsing fails, it's likely plain text that was mis-labeled.
                // Return the raw text as a fallback.
                return responseText;
            }
        }
        
        // If not JSON, return the response text directly.
        return responseText;

    } catch (error) {
        console.error("Error posting to webhook:", error);
        // Re-throw the original, more detailed error instead of a generic one.
        // This allows the UI to display specific issues like "Failed to fetch" (CORS/Network)
        // or "Webhook request failed: 401 Unauthorized".
        if (error instanceof Error) {
            throw error;
        }
        throw new Error("An unknown error occurred while contacting the workflow.");
    }
};
