
export interface Message {
  id: string;
  role: 'user' | 'model' | 'system' | 'workflow';
  content: string;
  isThinking?: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  systemPrompt: string;
  temperature: number;
  topP: number;
  createdAt: number;
}

export interface ImageObject {
  id: string;
  prompt: string;
  base64: string;
  status: 'generating' | 'ready' | 'error';
  createdAt: number;
}

export interface Workflow {
  id: string;
  name: string;
  webhookUrl: string;
}

export interface Agent {
  id: string;
  name: string;
  avatarColor: string;
  model: string;
  systemInstruction: string;
}
