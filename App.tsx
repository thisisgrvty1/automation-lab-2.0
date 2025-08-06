import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Button, Card, Input, Textarea, Slider, Modal, Dialog, Select } from './components/ui';
import { 
  Bot, Send, User, Sun, Moon, Home, MessageSquare, Zap, Image as ImageIcon, 
  HelpCircle, SlidersHorizontal, Settings, ArrowLeft, Download, RefreshCw, 
  Loader, Edit, Trash2, Plus, X, CheckSquare, Square, Eye, EyeOff 
} from './components/icons';
import { streamChat, generateImages, getTitleForChat, postToWebhook } from './services/aiService';
import type { Conversation, Message, ImageObject, Workflow, Agent } from './types';

const STORAGE_KEYS = {
  conversations: 'mal2_conversations',
  images: 'mal2_images',
  workflows: 'mal2_workflows',
  agents: 'mal2_agents',
  settings: 'mal2_settings',
  theme: 'mal2_theme'
};

interface Settings {
  makeApiKey: string;
  defaultModel: 'gemini-2.5-flash' | 'gpt-4o' | 'gpt-4o-mini' | 'gpt-3.5-turbo';
}

const DEFAULT_SETTINGS: Settings = {
  makeApiKey: '',
  defaultModel: 'gemini-2.5-flash'
};

const MODEL_OPTIONS = [
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { value: 'gpt-4o', label: 'GPT-4o' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
  { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' }
];

function App() {
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.theme);
    return saved ? JSON.parse(saved) : false;
  });

  const [conversations, setConversations] = useState<Conversation[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.conversations);
    return saved ? JSON.parse(saved) : [];
  });

  const [images, setImages] = useState<ImageObject[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.images);
    return saved ? JSON.parse(saved) : [];
  });

  const [workflows, setWorkflows] = useState<Workflow[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.workflows);
    return saved ? JSON.parse(saved) : [];
  });

  const [agents, setAgents] = useState<Agent[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.agents);
    return saved ? JSON.parse(saved) : [];
  });

  const [settings, setSettings] = useState<Settings>(() => {
    const saved = localStorage.getItem(STORAGE_KEYS.settings);
    return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : DEFAULT_SETTINGS;
  });

  const [currentView, setCurrentView] = useState<'home' | 'chat' | 'images' | 'workflows' | 'agents' | 'help' | 'settings'>('home');
  const [activeConversation, setActiveConversation] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState<{ type: string; id: string } | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDark);
    localStorage.setItem(STORAGE_KEYS.theme, JSON.stringify(isDark));
  }, [isDark]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.conversations, JSON.stringify(conversations));
  }, [conversations]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.images, JSON.stringify(images));
  }, [images]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.workflows, JSON.stringify(workflows));
  }, [workflows]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.agents, JSON.stringify(agents));
  }, [agents]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversations, activeConversation]);

  const createNewConversation = (model?: string) => {
    const newConversation: Conversation = {
      id: Date.now().toString(),
      title: 'New Chat',
      messages: [],
      systemPrompt: 'You are a helpful AI assistant.',
      temperature: 0.7,
      topP: 0.9,
      model: (model as any) || settings.defaultModel,
      createdAt: Date.now()
    };
    setConversations(prev => [newConversation, ...prev]);
    setActiveConversation(newConversation.id);
    setCurrentView('chat');
  };

  const sendMessage = async (content: string, conversationId: string) => {
    const conversation = conversations.find(c => c.id === conversationId);
    if (!conversation) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content
    };

    const updatedConversation = {
      ...conversation,
      messages: [...conversation.messages, userMessage]
    };

    if (conversation.messages.length === 0) {
      const title = await getTitleForChat(content, conversation.model);
      updatedConversation.title = title;
    }

    setConversations(prev => prev.map(c => c.id === conversationId ? updatedConversation : c));
    setIsGenerating(true);

    try {
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        content: '',
        isThinking: true
      };

      setConversations(prev => prev.map(c => 
        c.id === conversationId 
          ? { ...c, messages: [...c.messages, assistantMessage] }
          : c
      ));

      const stream = await streamChat(updatedConversation);
      let fullResponse = '';

      for await (const chunk of stream) {
        fullResponse += chunk.text;
        setConversations(prev => prev.map(c => 
          c.id === conversationId 
            ? {
                ...c,
                messages: c.messages.map(m => 
                  m.id === assistantMessage.id 
                    ? { ...m, content: fullResponse, isThinking: false }
                    : m
                )
              }
            : c
        ));
      }
    } catch (error) {
      console.error('Error sending message:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'model',
        content: `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`
      };

      setConversations(prev => prev.map(c => 
        c.id === conversationId 
          ? { ...c, messages: [...c.messages, errorMessage] }
          : c
      ));
    } finally {
      setIsGenerating(false);
    }
  };

  const generateImage = async (prompt: string) => {
    const imageObj: ImageObject = {
      id: Date.now().toString(),
      prompt,
      base64: '',
      status: 'generating',
      createdAt: Date.now()
    };

    setImages(prev => [imageObj, ...prev]);

    try {
      const imageBytes = await generateImages(prompt);
      const base64Images = imageBytes.map(bytes => `data:image/jpeg;base64,${bytes}`);
      
      const updatedImages = base64Images.map((base64, index) => ({
        ...imageObj,
        id: `${imageObj.id}_${index}`,
        base64,
        status: 'ready' as const
      }));

      setImages(prev => [
        ...updatedImages,
        ...prev.filter(img => img.id !== imageObj.id)
      ]);
    } catch (error) {
      console.error('Error generating image:', error);
      setImages(prev => prev.map(img => 
        img.id === imageObj.id 
          ? { ...img, status: 'error' }
          : img
      ));
    }
  };

  const executeWorkflow = async (workflowId: string, message: string) => {
    const workflow = workflows.find(w => w.id === workflowId);
    if (!workflow) return;

    const conversation = conversations.find(c => c.id === activeConversation);
    if (!conversation) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: message
    };

    setConversations(prev => prev.map(c => 
      c.id === activeConversation 
        ? { ...c, messages: [...c.messages, userMessage] }
        : c
    ));

    setIsGenerating(true);

    try {
      const response = await postToWebhook(workflow.webhookUrl, message, settings.makeApiKey);
      
      const workflowMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'workflow',
        content: response
      };

      setConversations(prev => prev.map(c => 
        c.id === activeConversation 
          ? { ...c, messages: [...c.messages, workflowMessage] }
          : c
      ));
    } catch (error) {
      console.error('Error executing workflow:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'workflow',
        content: `Error: ${error instanceof Error ? error.message : 'Unknown error occurred'}`
      };

      setConversations(prev => prev.map(c => 
        c.id === activeConversation 
          ? { ...c, messages: [...c.messages, errorMessage] }
          : c
      ));
    } finally {
      setIsGenerating(false);
    }
  };

  const deleteItem = (type: string, id: string) => {
    switch (type) {
      case 'conversation':
        setConversations(prev => prev.filter(c => c.id !== id));
        if (activeConversation === id) {
          setActiveConversation(null);
          setCurrentView('home');
        }
        break;
      case 'image':
        setImages(prev => prev.filter(img => img.id !== id));
        break;
      case 'workflow':
        setWorkflows(prev => prev.filter(w => w.id !== id));
        break;
      case 'agent':
        setAgents(prev => prev.filter(a => a.id !== id));
        break;
    }
    setShowDeleteDialog(null);
  };

  const Sidebar = () => (
    <div className="w-64 bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col">
      <div className="p-4 border-b border-gray-200 dark:border-gray-800">
        <h1 className="text-xl font-bold">Model Automation Lab 2.0</h1>
      </div>
      
      <nav className="flex-1 p-4 space-y-2">
        <Button
          variant={currentView === 'home' ? 'primary' : 'ghost'}
          className="w-full justify-start"
          onClick={() => setCurrentView('home')}
        >
          <Home className="w-4 h-4 mr-2" />
          Home
        </Button>
        
        <Button
          variant={currentView === 'chat' ? 'primary' : 'ghost'}
          className="w-full justify-start"
          onClick={() => setCurrentView('chat')}
        >
          <MessageSquare className="w-4 h-4 mr-2" />
          Chat
        </Button>
        
        <Button
          variant={currentView === 'images' ? 'primary' : 'ghost'}
          className="w-full justify-start"
          onClick={() => setCurrentView('images')}
        >
          <ImageIcon className="w-4 h-4 mr-2" />
          Images
        </Button>
        
        <Button
          variant={currentView === 'workflows' ? 'primary' : 'ghost'}
          className="w-full justify-start"
          onClick={() => setCurrentView('workflows')}
        >
          <Zap className="w-4 h-4 mr-2" />
          Workflows
        </Button>
        
        <Button
          variant={currentView === 'agents' ? 'primary' : 'ghost'}
          className="w-full justify-start"
          onClick={() => setCurrentView('agents')}
        >
          <Bot className="w-4 h-4 mr-2" />
          Agents
        </Button>
        
        <Button
          variant={currentView === 'help' ? 'primary' : 'ghost'}
          className="w-full justify-start"
          onClick={() => setCurrentView('help')}
        >
          <HelpCircle className="w-4 h-4 mr-2" />
          Help
        </Button>
      </nav>
      
      <div className="p-4 border-t border-gray-200 dark:border-gray-800 space-y-2">
        <Button
          variant="ghost"
          className="w-full justify-start"
          onClick={() => setShowSettingsModal(true)}
        >
          <Settings className="w-4 h-4 mr-2" />
          Settings
        </Button>
        
        <Button
          variant="ghost"
          className="w-full justify-start"
          onClick={() => setIsDark(!isDark)}
        >
          {isDark ? <Sun className="w-4 h-4 mr-2" /> : <Moon className="w-4 h-4 mr-2" />}
          {isDark ? 'Light' : 'Dark'} Mode
        </Button>
      </div>
    </div>
  );

  const HomeView = () => (
    <div className="flex-1 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold mb-4">Welcome to Model Automation Lab 2.0</h1>
          <p className="text-xl text-gray-600 dark:text-gray-400">
            Your comprehensive AI workspace for chat, image generation, workflows, and agent management
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          <Card className="p-6 hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setCurrentView('chat')}>
            <MessageSquare className="w-8 h-8 mb-4 text-blue-500" />
            <h3 className="text-lg font-semibold mb-2">Chat</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Engage with AI models including Gemini and GPT
            </p>
          </Card>

          <Card className="p-6 hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setCurrentView('images')}>
            <ImageIcon className="w-8 h-8 mb-4 text-green-500" />
            <h3 className="text-lg font-semibold mb-2">Images</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Generate stunning images with AI
            </p>
          </Card>

          <Card className="p-6 hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setCurrentView('workflows')}>
            <Zap className="w-8 h-8 mb-4 text-yellow-500" />
            <h3 className="text-lg font-semibold mb-2">Workflows</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Automate tasks with Make.com integration
            </p>
          </Card>

          <Card className="p-6 hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setCurrentView('agents')}>
            <Bot className="w-8 h-8 mb-4 text-purple-500" />
            <h3 className="text-lg font-semibold mb-2">Agents</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Create and manage AI agents
            </p>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Quick Start</h3>
            <div className="space-y-3">
              <Button 
                className="w-full justify-start" 
                onClick={() => createNewConversation('gemini-2.5-flash')}
              >
                <Plus className="w-4 h-4 mr-2" />
                New Gemini Chat
              </Button>
              <Button 
                className="w-full justify-start" 
                onClick={() => createNewConversation('gpt-4o')}
              >
                <Plus className="w-4 h-4 mr-2" />
                New GPT-4o Chat
              </Button>
              <Button 
                className="w-full justify-start" 
                onClick={() => setCurrentView('images')}
              >
                <ImageIcon className="w-4 h-4 mr-2" />
                Generate Images
              </Button>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Recent Activity</h3>
            <div className="space-y-3">
              {conversations.slice(0, 3).map(conv => (
                <div 
                  key={conv.id}
                  className="flex items-center justify-between p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"
                  onClick={() => {
                    setActiveConversation(conv.id);
                    setCurrentView('chat');
                  }}
                >
                  <div className="flex items-center">
                    <MessageSquare className="w-4 h-4 mr-2 text-gray-400" />
                    <span className="text-sm truncate">{conv.title}</span>
                  </div>
                  <span className="text-xs text-gray-400">
                    {MODEL_OPTIONS.find(m => m.value === conv.model)?.label || conv.model}
                  </span>
                </div>
              ))}
              {conversations.length === 0 && (
                <p className="text-sm text-gray-500 dark:text-gray-400">No recent conversations</p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );

  const ChatView = () => {
    const [input, setInput] = useState('');
    const [showConversationSettings, setShowConversationSettings] = useState(false);
    const conversation = activeConversation ? conversations.find(c => c.id === activeConversation) : null;

    const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (!input.trim() || !activeConversation) return;
      sendMessage(input.trim(), activeConversation);
      setInput('');
    };

    const updateConversationSettings = (updates: Partial<Conversation>) => {
      if (!activeConversation) return;
      setConversations(prev => prev.map(c => 
        c.id === activeConversation ? { ...c, ...updates } : c
      ));
    };

    return (
      <div className="flex-1 flex">
        <div className="w-64 bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Conversations</h2>
            <Button size="sm" onClick={() => createNewConversation()}>
              <Plus className="w-4 h-4" />
            </Button>
          </div>
          
          <div className="space-y-2">
            {conversations.map(conv => (
              <div
                key={conv.id}
                className={`p-3 rounded-lg cursor-pointer transition-colors ${
                  activeConversation === conv.id 
                    ? 'bg-white dark:bg-gray-800 shadow-sm' 
                    : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
                onClick={() => setActiveConversation(conv.id)}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium truncate">{conv.title}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="w-6 h-6 opacity-0 group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowDeleteDialog({ type: 'conversation', id: conv.id });
                    }}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-gray-500">
                    {conv.messages.length} messages
                  </span>
                  <span className="text-xs text-gray-400">
                    {MODEL_OPTIONS.find(m => m.value === conv.model)?.label || conv.model}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 flex flex-col">
          {conversation ? (
            <>
              <div className="border-b border-gray-200 dark:border-gray-800 p-4 flex items-center justify-between">
                <div>
                  <h2 className="font-semibold">{conversation.title}</h2>
                  <p className="text-sm text-gray-500">
                    {MODEL_OPTIONS.find(m => m.value === conversation.model)?.label || conversation.model}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowConversationSettings(true)}
                >
                  <SlidersHorizontal className="w-4 h-4" />
                </Button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {conversation.messages.map(message => (
                  <div
                    key={message.id}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`flex items-start space-x-2 max-w-3xl ${message.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                        message.role === 'user' 
                          ? 'bg-blue-500 text-white' 
                          : message.role === 'workflow'
                          ? 'bg-yellow-500 text-white'
                          : 'bg-gray-200 dark:bg-gray-700'
                      }`}>
                        {message.role === 'user' ? (
                          <User className="w-4 h-4" />
                        ) : message.role === 'workflow' ? (
                          <Zap className="w-4 h-4" />
                        ) : (
                          <Bot className="w-4 h-4" />
                        )}
                      </div>
                      <div className={`rounded-lg p-3 ${
                        message.role === 'user'
                          ? 'bg-blue-500 text-white'
                          : message.role === 'workflow'
                          ? 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200'
                          : 'bg-gray-100 dark:bg-gray-800'
                      }`}>
                        {message.isThinking ? (
                          <div className="flex items-center space-x-2">
                            <Loader className="w-4 h-4" />
                            <span>Thinking...</span>
                          </div>
                        ) : (
                          <div className="whitespace-pre-wrap">{message.content}</div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              <form onSubmit={handleSubmit} className="border-t border-gray-200 dark:border-gray-800 p-4">
                <div className="flex space-x-2">
                  <Input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Type your message..."
                    disabled={isGenerating}
                    className="flex-1"
                  />
                  <Button type="submit" disabled={isGenerating || !input.trim()}>
                    {isGenerating ? <Loader className="w-4 h-4" /> : <Send className="w-4 h-4" />}
                  </Button>
                </div>
              </form>

              <Modal
                isOpen={showConversationSettings}
                onClose={() => setShowConversationSettings(false)}
                title="Conversation Settings"
              >
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">Model</label>
                    <Select
                      value={conversation.model}
                      onChange={(e) => updateConversationSettings({ model: e.target.value as any })}
                    >
                      {MODEL_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-2">System Prompt</label>
                    <Textarea
                      value={conversation.systemPrompt}
                      onChange={(e) => updateConversationSettings({ systemPrompt: e.target.value })}
                      rows={3}
                    />
                  </div>
                  
                  <Slider
                    label="Temperature"
                    value={conversation.temperature}
                    min={0}
                    max={1}
                    step={0.1}
                    onChange={(e) => updateConversationSettings({ temperature: parseFloat(e.target.value) })}
                  />
                  
                  <Slider
                    label="Top P"
                    value={conversation.topP}
                    min={0}
                    max={1}
                    step={0.1}
                    onChange={(e) => updateConversationSettings({ topP: parseFloat(e.target.value) })}
                  />
                </div>
              </Modal>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <MessageSquare className="w-12 h-12 mx-auto mb-4 text-gray-400" />
                <h3 className="text-lg font-semibold mb-2">No conversation selected</h3>
                <p className="text-gray-500 mb-4">Choose a conversation or start a new one</p>
                <Button onClick={() => createNewConversation()}>
                  <Plus className="w-4 h-4 mr-2" />
                  New Conversation
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const ImagesView = () => {
    const [prompt, setPrompt] = useState('');

    const handleGenerate = (e: React.FormEvent) => {
      e.preventDefault();
      if (!prompt.trim()) return;
      generateImage(prompt.trim());
      setPrompt('');
    };

    return (
      <div className="flex-1 p-8">
        <div className="max-w-6xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold mb-4">Image Generation</h1>
            <form onSubmit={handleGenerate} className="flex space-x-2">
              <Input
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the image you want to generate..."
                className="flex-1"
              />
              <Button type="submit" disabled={!prompt.trim()}>
                <ImageIcon className="w-4 h-4 mr-2" />
                Generate
              </Button>
            </form>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {images.map(image => (
              <Card key={image.id} className="overflow-hidden">
                <div className="aspect-square bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                  {image.status === 'generating' ? (
                    <div className="text-center">
                      <Loader className="w-8 h-8 mx-auto mb-2" />
                      <p className="text-sm text-gray-500">Generating...</p>
                    </div>
                  ) : image.status === 'error' ? (
                    <div className="text-center text-red-500">
                      <X className="w-8 h-8 mx-auto mb-2" />
                      <p className="text-sm">Generation failed</p>
                    </div>
                  ) : (
                    <img
                      src={image.base64}
                      alt={image.prompt}
                      className="w-full h-full object-cover"
                    />
                  )}
                </div>
                <div className="p-4">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-2 line-clamp-2">
                    {image.prompt}
                  </p>
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-gray-500">
                      {new Date(image.createdAt).toLocaleDateString()}
                    </span>
                    {image.status === 'ready' && (
                      <div className="flex space-x-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            const link = document.createElement('a');
                            link.href = image.base64;
                            link.download = `generated-image-${image.id}.jpg`;
                            link.click();
                          }}
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setShowDeleteDialog({ type: 'image', id: image.id })}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>

          {images.length === 0 && (
            <div className="text-center py-12">
              <ImageIcon className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <h3 className="text-lg font-semibold mb-2">No images generated yet</h3>
              <p className="text-gray-500">Enter a prompt above to generate your first image</p>
            </div>
          )}
        </div>
      </div>
    );
  };

  const WorkflowsView = () => {
    const [showWorkflowModal, setShowWorkflowModal] = useState(false);
    const [editingWorkflow, setEditingWorkflow] = useState<Workflow | null>(null);
    const [workflowForm, setWorkflowForm] = useState({ name: '', webhookUrl: '' });

    const handleSaveWorkflow = () => {
      if (!workflowForm.name.trim() || !workflowForm.webhookUrl.trim()) return;

      if (editingWorkflow) {
        setWorkflows(prev => prev.map(w => 
          w.id === editingWorkflow.id 
            ? { ...w, name: workflowForm.name, webhookUrl: workflowForm.webhookUrl }
            : w
        ));
      } else {
        const newWorkflow: Workflow = {
          id: Date.now().toString(),
          name: workflowForm.name,
          webhookUrl: workflowForm.webhookUrl
        };
        setWorkflows(prev => [newWorkflow, ...prev]);
      }

      setShowWorkflowModal(false);
      setEditingWorkflow(null);
      setWorkflowForm({ name: '', webhookUrl: '' });
    };

    const openWorkflowModal = (workflow?: Workflow) => {
      if (workflow) {
        setEditingWorkflow(workflow);
        setWorkflowForm({ name: workflow.name, webhookUrl: workflow.webhookUrl });
      } else {
        setEditingWorkflow(null);
        setWorkflowForm({ name: '', webhookUrl: '' });
      }
      setShowWorkflowModal(true);
    };

    return (
      <div className="flex-1 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold mb-2">Workflows</h1>
              <p className="text-gray-600 dark:text-gray-400">
                Manage your Make.com webhook integrations
              </p>
            </div>
            <Button onClick={() => openWorkflowModal()}>
              <Plus className="w-4 h-4 mr-2" />
              Add Workflow
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {workflows.map(workflow => (
              <Card key={workflow.id} className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <Zap className="w-8 h-8 text-yellow-500" />
                  <div className="flex space-x-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => openWorkflowModal(workflow)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setShowDeleteDialog({ type: 'workflow', id: workflow.id })}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <h3 className="font-semibold mb-2">{workflow.name}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 truncate">
                  {workflow.webhookUrl}
                </p>
                <Button
                  size="sm"
                  className="w-full"
                  onClick={() => {
                    if (!activeConversation) {
                      createNewConversation();
                    }
                    setCurrentView('chat');
                  }}
                >
                  Use in Chat
                </Button>
              </Card>
            ))}
          </div>

          {workflows.length === 0 && (
            <div className="text-center py-12">
              <Zap className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <h3 className="text-lg font-semibold mb-2">No workflows configured</h3>
              <p className="text-gray-500 mb-4">Add your first Make.com webhook to get started</p>
              <Button onClick={() => openWorkflowModal()}>
                <Plus className="w-4 h-4 mr-2" />
                Add Workflow
              </Button>
            </div>
          )}

          <Modal
            isOpen={showWorkflowModal}
            onClose={() => setShowWorkflowModal(false)}
            title={editingWorkflow ? 'Edit Workflow' : 'Add Workflow'}
          >
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Name</label>
                <Input
                  value={workflowForm.name}
                  onChange={(e) => setWorkflowForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter workflow name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Webhook URL</label>
                <Input
                  value={workflowForm.webhookUrl}
                  onChange={(e) => setWorkflowForm(prev => ({ ...prev, webhookUrl: e.target.value }))}
                  placeholder="https://hook.make.com/..."
                />
              </div>
              <div className="flex justify-end space-x-2">
                <Button variant="secondary" onClick={() => setShowWorkflowModal(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSaveWorkflow}>
                  {editingWorkflow ? 'Update' : 'Add'} Workflow
                </Button>
              </div>
            </div>
          </Modal>
        </div>
      </div>
    );
  };

  const AgentsView = () => {
    const [showAgentModal, setShowAgentModal] = useState(false);
    const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
    const [agentForm, setAgentForm] = useState({
      name: '',
      avatarColor: '#3B82F6',
      model: 'gemini-2.5-flash' as const,
      systemInstruction: ''
    });

    const handleSaveAgent = () => {
      if (!agentForm.name.trim()) return;

      if (editingAgent) {
        setAgents(prev => prev.map(a => 
          a.id === editingAgent.id 
            ? { ...a, ...agentForm }
            : a
        ));
      } else {
        const newAgent: Agent = {
          id: Date.now().toString(),
          ...agentForm
        };
        setAgents(prev => [newAgent, ...prev]);
      }

      setShowAgentModal(false);
      setEditingAgent(null);
      setAgentForm({
        name: '',
        avatarColor: '#3B82F6',
        model: 'gemini-2.5-flash',
        systemInstruction: ''
      });
    };

    const openAgentModal = (agent?: Agent) => {
      if (agent) {
        setEditingAgent(agent);
        setAgentForm({
          name: agent.name,
          avatarColor: agent.avatarColor,
          model: agent.model as any,
          systemInstruction: agent.systemInstruction
        });
      } else {
        setEditingAgent(null);
        setAgentForm({
          name: '',
          avatarColor: '#3B82F6',
          model: 'gemini-2.5-flash',
          systemInstruction: ''
        });
      }
      setShowAgentModal(true);
    };

    const startChatWithAgent = (agent: Agent) => {
      const newConversation: Conversation = {
        id: Date.now().toString(),
        title: `Chat with ${agent.name}`,
        messages: [],
        systemPrompt: agent.systemInstruction,
        temperature: 0.7,
        topP: 0.9,
        model: agent.model as any,
        createdAt: Date.now()
      };
      setConversations(prev => [newConversation, ...prev]);
      setActiveConversation(newConversation.id);
      setCurrentView('chat');
    };

    return (
      <div className="flex-1 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-3xl font-bold mb-2">AI Agents</h1>
              <p className="text-gray-600 dark:text-gray-400">
                Create and manage specialized AI agents
              </p>
            </div>
            <Button onClick={() => openAgentModal()}>
              <Plus className="w-4 h-4 mr-2" />
              Create Agent
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {agents.map(agent => (
              <Card key={agent.id} className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center text-white"
                    style={{ backgroundColor: agent.avatarColor }}
                  >
                    <Bot className="w-6 h-6" />
                  </div>
                  <div className="flex space-x-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => openAgentModal(agent)}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setShowDeleteDialog({ type: 'agent', id: agent.id })}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <h3 className="font-semibold mb-2">{agent.name}</h3>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                  {MODEL_OPTIONS.find(m => m.value === agent.model)?.label || agent.model}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4 line-clamp-2">
                  {agent.systemInstruction || 'No system instruction set'}
                </p>
                <Button
                  size="sm"
                  className="w-full"
                  onClick={() => startChatWithAgent(agent)}
                >
                  Start Chat
                </Button>
              </Card>
            ))}
          </div>

          {agents.length === 0 && (
            <div className="text-center py-12">
              <Bot className="w-12 h-12 mx-auto mb-4 text-gray-400" />
              <h3 className="text-lg font-semibold mb-2">No agents created yet</h3>
              <p className="text-gray-500 mb-4">Create your first AI agent to get started</p>
              <Button onClick={() => openAgentModal()}>
                <Plus className="w-4 h-4 mr-2" />
                Create Agent
              </Button>
            </div>
          )}

          <Modal
            isOpen={showAgentModal}
            onClose={() => setShowAgentModal(false)}
            title={editingAgent ? 'Edit Agent' : 'Create Agent'}
          >
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Name</label>
                <Input
                  value={agentForm.name}
                  onChange={(e) => setAgentForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Enter agent name"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Avatar Color</label>
                <input
                  type="color"
                  value={agentForm.avatarColor}
                  onChange={(e) => setAgentForm(prev => ({ ...prev, avatarColor: e.target.value }))}
                  className="w-full h-10 rounded border border-gray-300 dark:border-gray-700"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Model</label>
                <Select
                  value={agentForm.model}
                  onChange={(e) => setAgentForm(prev => ({ ...prev, model: e.target.value as any }))}
                >
                  {MODEL_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">System Instruction</label>
                <Textarea
                  value={agentForm.systemInstruction}
                  onChange={(e) => setAgentForm(prev => ({ ...prev, systemInstruction: e.target.value }))}
                  placeholder="Define the agent's role and behavior..."
                  rows={4}
                />
              </div>
              
              <div className="flex justify-end space-x-2">
                <Button variant="secondary" onClick={() => setShowAgentModal(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSaveAgent}>
                  {editingAgent ? 'Update' : 'Create'} Agent
                </Button>
              </div>
            </div>
          </Modal>
        </div>
      </div>
    );
  };

  const HelpView = () => (
    <div className="flex-1 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Help & Documentation</h1>
        
        <div className="space-y-8">
          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">Getting Started</h2>
            <div className="space-y-4">
              <div>
                <h3 className="font-medium mb-2">1. Configure API Keys</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Set up your Gemini and OpenAI API keys in the Settings to enable AI features.
                </p>
              </div>
              <div>
                <h3 className="font-medium mb-2">2. Start Chatting</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Create a new conversation and choose between different AI models like Gemini 2.5 Flash or GPT-4o.
                </p>
              </div>
              <div>
                <h3 className="font-medium mb-2">3. Generate Images</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Use the Images section to generate AI-powered images with detailed prompts.
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">Features</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-medium mb-2 flex items-center">
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Multi-Model Chat
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Support for Gemini 2.5 Flash, GPT-4o, GPT-4o Mini, and GPT-3.5 Turbo models.
                </p>
              </div>
              <div>
                <h3 className="font-medium mb-2 flex items-center">
                  <ImageIcon className="w-4 h-4 mr-2" />
                  Image Generation
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Generate high-quality images using Google's Imagen 3.0 model.
                </p>
              </div>
              <div>
                <h3 className="font-medium mb-2 flex items-center">
                  <Zap className="w-4 h-4 mr-2" />
                  Workflow Integration
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Connect with Make.com webhooks for automated workflows.
                </p>
              </div>
              <div>
                <h3 className="font-medium mb-2 flex items-center">
                  <Bot className="w-4 h-4 mr-2" />
                  Custom Agents
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Create specialized AI agents with custom instructions and personalities.
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">Keyboard Shortcuts</h2>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-sm">New Conversation</span>
                <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded text-xs">Ctrl + N</kbd>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">Toggle Theme</span>
                <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded text-xs">Ctrl + D</kbd>
              </div>
              <div className="flex justify-between">
                <span className="text-sm">Focus Message Input</span>
                <kbd className="px-2 py-1 bg-gray-100 dark:bg-gray-800 rounded text-xs">Ctrl + /</kbd>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );

  const SettingsModal = () => (
    <Modal
      isOpen={showSettingsModal}
      onClose={() => setShowSettingsModal(false)}
      title="Settings"
      size="xl"
    >
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold mb-4">API Configuration</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Make.com API Key</label>
              <Input
                type="password"
                value={settings.makeApiKey}
                onChange={(e) => setSettings(prev => ({ ...prev, makeApiKey: e.target.value }))}
                placeholder="Enter your Make.com API key"
              />
              <p className="text-xs text-gray-500 mt-1">
                Required for workflow integrations
              </p>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-4">Default Settings</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Default Model</label>
              <Select
                value={settings.defaultModel}
                onChange={(e) => setSettings(prev => ({ ...prev, defaultModel: e.target.value as any }))}
              >
                {MODEL_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-4">Data Management</h3>
          <div className="space-y-2">
            <Button
              variant="danger"
              onClick={() => {
                if (confirm('Are you sure you want to clear all conversations? This cannot be undone.')) {
                  setConversations([]);
                  setActiveConversation(null);
                }
              }}
            >
              Clear All Conversations
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (confirm('Are you sure you want to clear all images? This cannot be undone.')) {
                  setImages([]);
                }
              }}
            >
              Clear All Images
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );

  return (
    <div className="h-screen flex bg-white dark:bg-black text-black dark:text-white">
      <Sidebar />
      
      {currentView === 'home' && <HomeView />}
      {currentView === 'chat' && <ChatView />}
      {currentView === 'images' && <ImagesView />}
      {currentView === 'workflows' && <WorkflowsView />}
      {currentView === 'agents' && <AgentsView />}
      {currentView === 'help' && <HelpView />}

      <SettingsModal />

      <Dialog
        isOpen={!!showDeleteDialog}
        onClose={() => setShowDeleteDialog(null)}
        title="Confirm Deletion"
        description={`Are you sure you want to delete this ${showDeleteDialog?.type}? This action cannot be undone.`}
        onConfirm={() => showDeleteDialog && deleteItem(showDeleteDialog.type, showDeleteDialog.id)}
        confirmText="Delete"
      />
    </div>
  );
}

export default App;