import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Button, Card, Input, Textarea, Slider, Modal, Dialog, Select, Checkbox } from './components/ui';
import { 
  Bot, Send, User, Sun, Moon, Home, MessageSquare, Zap, Image, 
  HelpCircle, SlidersHorizontal, Settings, ArrowLeft, Download, 
  RefreshCw, Loader, Edit, Trash2, Plus, X, CheckSquare, Square,
  Eye, EyeOff
} from './components/icons';
import { streamChat, generateImages, getTitleForChat, postToWebhook } from './services/aiService';
import type { Conversation, Message, ImageObject, Workflow, Agent } from './types';

// Constants
const STORAGE_KEYS = {
  CONVERSATIONS: 'conversations',
  IMAGES: 'images',
  WORKFLOWS: 'workflows',
  AGENTS: 'agents',
  SETTINGS: 'settings',
  THEME: 'theme'
} as const;

const DEFAULT_SYSTEM_PROMPT = "You are a helpful AI assistant. Be concise and accurate in your responses.";

const MODELS = [
  { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { value: 'gpt-4o', label: 'GPT-4o' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
  { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' }
] as const;

const AVATAR_COLORS = [
  '#3B82F6', '#EF4444', '#10B981', '#F59E0B', 
  '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16'
] as const;

// Custom hooks
const useLocalStorage = <T,>(key: string, defaultValue: T) => {
  const [value, setValue] = useState<T>(() => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  const setStoredValue = useCallback((newValue: T | ((prev: T) => T)) => {
    setValue(prev => {
      const valueToStore = typeof newValue === 'function' ? (newValue as (prev: T) => T)(prev) : newValue;
      try {
        localStorage.setItem(key, JSON.stringify(valueToStore));
      } catch (error) {
        console.error(`Error saving to localStorage:`, error);
      }
      return valueToStore;
    });
  }, [key]);

  return [value, setStoredValue] as const;
};

const useTheme = () => {
  const [theme, setTheme] = useLocalStorage(STORAGE_KEYS.THEME, 'dark');

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  }, [setTheme]);

  return { theme, toggleTheme };
};

// Main App Component
const App: React.FC = () => {
  const { theme, toggleTheme } = useTheme();
  const [currentView, setCurrentView] = useState<'home' | 'chat' | 'images' | 'workflows' | 'agents' | 'settings'>('home');
  const [conversations, setConversations] = useLocalStorage<Conversation[]>(STORAGE_KEYS.CONVERSATIONS, []);
  const [images, setImages] = useLocalStorage<ImageObject[]>(STORAGE_KEYS.IMAGES, []);
  const [workflows, setWorkflows] = useLocalStorage<Workflow[]>(STORAGE_KEYS.WORKFLOWS, []);
  const [agents, setAgents] = useLocalStorage<Agent[]>(STORAGE_KEYS.AGENTS, []);
  const [settings, setSettings] = useLocalStorage(STORAGE_KEYS.SETTINGS, {
    makeApiKey: '',
    defaultModel: 'gemini-2.5-flash' as const,
    defaultTemperature: 0.7,
    defaultTopP: 0.9
  });

  // Navigation
  const NavigationButton: React.FC<{
    icon: React.ComponentType<any>;
    label: string;
    view: typeof currentView;
    isActive: boolean;
  }> = ({ icon: Icon, label, view, isActive }) => (
    <Button
      variant={isActive ? "primary" : "ghost"}
      className="w-full justify-start gap-3 h-12"
      onClick={() => setCurrentView(view)}
    >
      <Icon className="w-5 h-5" />
      {label}
    </Button>
  );

  const Sidebar: React.FC = () => (
    <div className="w-64 bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col">
      <div className="p-4 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-lg">Model Lab 2.0</h1>
            <p className="text-xs text-gray-500 dark:text-gray-400">AI Automation Platform</p>
          </div>
        </div>
      </div>
      
      <nav className="flex-1 p-4 space-y-2">
        <NavigationButton icon={Home} label="Dashboard" view="home" isActive={currentView === 'home'} />
        <NavigationButton icon={MessageSquare} label="Chat" view="chat" isActive={currentView === 'chat'} />
        <NavigationButton icon={Image} label="Images" view="images" isActive={currentView === 'images'} />
        <NavigationButton icon={Zap} label="Workflows" view="workflows" isActive={currentView === 'workflows'} />
        <NavigationButton icon={Bot} label="Agents" view="agents" isActive={currentView === 'agents'} />
      </nav>
      
      <div className="p-4 border-t border-gray-200 dark:border-gray-800 space-y-2">
        <Button variant="ghost" className="w-full justify-start gap-3 h-12" onClick={() => setCurrentView('settings')}>
          <Settings className="w-5 h-5" />
          Settings
        </Button>
        <Button variant="ghost" className="w-full justify-start gap-3 h-12" onClick={toggleTheme}>
          {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
        </Button>
      </div>
    </div>
  );

  // Dashboard View
  const DashboardView: React.FC = () => {
    const stats = useMemo(() => ({
      totalChats: conversations.length,
      totalImages: images.length,
      totalWorkflows: workflows.length,
      totalAgents: agents.length
    }), [conversations.length, images.length, workflows.length, agents.length]);

    const StatCard: React.FC<{ title: string; value: number; icon: React.ComponentType<any> }> = ({ title, value, icon: Icon }) => (
      <Card className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{title}</p>
            <p className="text-2xl font-bold">{value}</p>
          </div>
          <Icon className="w-8 h-8 text-gray-400" />
        </div>
      </Card>
    );

    return (
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
          <p className="text-gray-600 dark:text-gray-400">Welcome to your AI automation platform</p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatCard title="Total Chats" value={stats.totalChats} icon={MessageSquare} />
          <StatCard title="Generated Images" value={stats.totalImages} icon={Image} />
          <StatCard title="Active Workflows" value={stats.totalWorkflows} icon={Zap} />
          <StatCard title="AI Agents" value={stats.totalAgents} icon={Bot} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Quick Actions</h3>
            <div className="space-y-3">
              <Button className="w-full justify-start gap-3" onClick={() => setCurrentView('chat')}>
                <MessageSquare className="w-4 h-4" />
                Start New Chat
              </Button>
              <Button className="w-full justify-start gap-3" onClick={() => setCurrentView('images')}>
                <Image className="w-4 h-4" />
                Generate Images
              </Button>
              <Button className="w-full justify-start gap-3" onClick={() => setCurrentView('workflows')}>
                <Zap className="w-4 h-4" />
                Create Workflow
              </Button>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Recent Activity</h3>
            <div className="space-y-3">
              {conversations.slice(0, 3).map(conv => (
                <div key={conv.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800">
                  <MessageSquare className="w-4 h-4 text-gray-400" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{conv.title}</p>
                    <p className="text-xs text-gray-500">{new Date(conv.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>
              ))}
              {conversations.length === 0 && (
                <p className="text-sm text-gray-500 dark:text-gray-400">No recent activity</p>
              )}
            </div>
          </Card>
        </div>
      </div>
    );
  };

  // Chat View
  const ChatView: React.FC = () => {
    const [activeConversation, setActiveConversation] = useState<string | null>(null);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [showSettings, setShowSettings] = useState(false);

    const currentConversation = useMemo(() => 
      conversations.find(c => c.id === activeConversation), 
      [conversations, activeConversation]
    );

    const createNewConversation = useCallback(() => {
      const newConv: Conversation = {
        id: Date.now().toString(),
        title: 'New Chat',
        messages: [],
        systemPrompt: DEFAULT_SYSTEM_PROMPT,
        temperature: settings.defaultTemperature,
        topP: settings.defaultTopP,
        model: settings.defaultModel,
        createdAt: Date.now()
      };
      setConversations(prev => [newConv, ...prev]);
      setActiveConversation(newConv.id);
    }, [setConversations, settings]);

    const sendMessage = useCallback(async () => {
      if (!input.trim() || !currentConversation || isLoading) return;

      const userMessage: Message = {
        id: Date.now().toString(),
        role: 'user',
        content: input.trim()
      };

      const updatedConversation = {
        ...currentConversation,
        messages: [...currentConversation.messages, userMessage]
      };

      setConversations(prev => prev.map(c => c.id === activeConversation ? updatedConversation : c));
      setInput('');
      setIsLoading(true);

      try {
        // Generate title for first message
        if (currentConversation.messages.length === 0) {
          const title = await getTitleForChat(input.trim(), currentConversation.model);
          setConversations(prev => prev.map(c => 
            c.id === activeConversation ? { ...c, title } : c
          ));
        }

        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'model',
          content: ''
        };

        setConversations(prev => prev.map(c => 
          c.id === activeConversation 
            ? { ...c, messages: [...c.messages, assistantMessage] }
            : c
        ));

        const stream = await streamChat(updatedConversation);
        
        for await (const chunk of stream) {
          if (chunk.text) {
            setConversations(prev => prev.map(c => 
              c.id === activeConversation 
                ? {
                    ...c,
                    messages: c.messages.map(m => 
                      m.id === assistantMessage.id 
                        ? { ...m, content: m.content + chunk.text }
                        : m
                    )
                  }
                : c
            ));
          }
        }
      } catch (error) {
        console.error('Error sending message:', error);
        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'model',
          content: `Error: ${error instanceof Error ? error.message : 'An unknown error occurred'}`
        };
        
        setConversations(prev => prev.map(c => 
          c.id === activeConversation 
            ? { ...c, messages: [...c.messages, errorMessage] }
            : c
        ));
      } finally {
        setIsLoading(false);
      }
    }, [input, currentConversation, isLoading, activeConversation, setConversations]);

    const deleteConversation = useCallback((id: string) => {
      setConversations(prev => prev.filter(c => c.id !== id));
      if (activeConversation === id) {
        setActiveConversation(null);
      }
    }, [setConversations, activeConversation]);

    const updateConversationSettings = useCallback((updates: Partial<Conversation>) => {
      if (!activeConversation) return;
      setConversations(prev => prev.map(c => 
        c.id === activeConversation ? { ...c, ...updates } : c
      ));
    }, [activeConversation, setConversations]);

    return (
      <div className="flex h-full">
        {/* Chat List */}
        <div className="w-80 border-r border-gray-200 dark:border-gray-800 flex flex-col">
          <div className="p-4 border-b border-gray-200 dark:border-gray-800">
            <Button onClick={createNewConversation} className="w-full gap-2">
              <Plus className="w-4 h-4" />
              New Chat
            </Button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {conversations.map(conv => (
              <div
                key={conv.id}
                className={`p-3 rounded-lg cursor-pointer group hover:bg-gray-100 dark:hover:bg-gray-800 ${
                  activeConversation === conv.id ? 'bg-gray-100 dark:bg-gray-800' : ''
                }`}
                onClick={() => setActiveConversation(conv.id)}
              >
                <div className="flex items-center justify-between">
                  <h4 className="font-medium truncate flex-1">{conv.title}</h4>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="opacity-0 group-hover:opacity-100 w-6 h-6"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteConversation(conv.id);
                    }}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  {conv.messages.length} messages • {new Date(conv.createdAt).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col">
          {currentConversation ? (
            <>
              {/* Chat Header */}
              <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
                <div>
                  <h2 className="font-semibold">{currentConversation.title}</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {currentConversation.model} • {currentConversation.messages.length} messages
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setShowSettings(true)}>
                  <SlidersHorizontal className="w-4 h-4" />
                </Button>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {currentConversation.messages.map(message => (
                  <div key={message.id} className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {message.role !== 'user' && (
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                        <Bot className="w-4 h-4 text-white" />
                      </div>
                    )}
                    <div className={`max-w-[70%] p-3 rounded-lg ${
                      message.role === 'user' 
                        ? 'bg-blue-500 text-white' 
                        : 'bg-gray-100 dark:bg-gray-800'
                    }`}>
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    </div>
                    {message.role === 'user' && (
                      <div className="w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-700 flex items-center justify-center flex-shrink-0">
                        <User className="w-4 h-4" />
                      </div>
                    )}
                  </div>
                ))}
                {isLoading && (
                  <div className="flex gap-3 justify-start">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                      <Bot className="w-4 h-4 text-white" />
                    </div>
                    <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-lg">
                      <Loader className="w-4 h-4" />
                    </div>
                  </div>
                )}
              </div>

              {/* Input */}
              <div className="p-4 border-t border-gray-200 dark:border-gray-800">
                <div className="flex gap-2">
                  <Input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Type your message..."
                    onKeyPress={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                    disabled={isLoading}
                    className="flex-1"
                  />
                  <Button onClick={sendMessage} disabled={!input.trim() || isLoading}>
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <MessageSquare className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">No conversation selected</h3>
                <p className="text-gray-500 dark:text-gray-400 mb-4">Choose a conversation or start a new one</p>
                <Button onClick={createNewConversation}>
                  <Plus className="w-4 h-4 mr-2" />
                  New Chat
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Chat Settings Modal */}
        {showSettings && currentConversation && (
          <Modal isOpen={showSettings} onClose={() => setShowSettings(false)} title="Chat Settings">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Model</label>
                <Select
                  value={currentConversation.model}
                  onChange={(e) => updateConversationSettings({ model: e.target.value as any })}
                >
                  {MODELS.map(model => (
                    <option key={model.value} value={model.value}>{model.label}</option>
                  ))}
                </Select>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">System Prompt</label>
                <Textarea
                  value={currentConversation.systemPrompt}
                  onChange={(e) => updateConversationSettings({ systemPrompt: e.target.value })}
                  rows={3}
                />
              </div>
              
              <Slider
                label="Temperature"
                value={currentConversation.temperature}
                min={0}
                max={1}
                step={0.1}
                onChange={(e) => updateConversationSettings({ temperature: parseFloat(e.target.value) })}
              />
              
              <Slider
                label="Top P"
                value={currentConversation.topP}
                min={0}
                max={1}
                step={0.1}
                onChange={(e) => updateConversationSettings({ topP: parseFloat(e.target.value) })}
              />
            </div>
          </Modal>
        )}
      </div>
    );
  };

  // Image Generation View
  const ImageView: React.FC = () => {
    const [prompt, setPrompt] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    const generateImage = useCallback(async () => {
      if (!prompt.trim() || isGenerating) return;

      const newImage: ImageObject = {
        id: Date.now().toString(),
        prompt: prompt.trim(),
        base64: '',
        status: 'generating',
        createdAt: Date.now()
      };

      setImages(prev => [newImage, ...prev]);
      setPrompt('');
      setIsGenerating(true);

      try {
        const imageBytes = await generateImages(prompt.trim());
        const base64 = `data:image/jpeg;base64,${imageBytes[0]}`;
        
        setImages(prev => prev.map(img => 
          img.id === newImage.id 
            ? { ...img, base64, status: 'ready' as const }
            : img
        ));
      } catch (error) {
        console.error('Error generating image:', error);
        setImages(prev => prev.map(img => 
          img.id === newImage.id 
            ? { ...img, status: 'error' as const }
            : img
        ));
      } finally {
        setIsGenerating(false);
      }
    }, [prompt, isGenerating, setImages]);

    const deleteImage = useCallback((id: string) => {
      setImages(prev => prev.filter(img => img.id !== id));
    }, [setImages]);

    return (
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Image Generation</h1>
          <p className="text-gray-600 dark:text-gray-400">Create stunning images with AI</p>
        </div>

        <Card className="p-6 mb-8">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Image Prompt</label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe the image you want to generate..."
                rows={3}
              />
            </div>
            <Button 
              onClick={generateImage} 
              disabled={!prompt.trim() || isGenerating}
              className="w-full"
            >
              {isGenerating ? (
                <>
                  <Loader className="w-4 h-4 mr-2" />
                  Generating...
                </>
              ) : (
                <>
                  <Image className="w-4 h-4 mr-2" />
                  Generate Image
                </>
              )}
            </Button>
          </div>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {images.map(image => (
            <Card key={image.id} className="overflow-hidden">
              <div className="aspect-square bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                {image.status === 'generating' && (
                  <Loader className="w-8 h-8 text-gray-400" />
                )}
                {image.status === 'ready' && image.base64 && (
                  <img src={image.base64} alt={image.prompt} className="w-full h-full object-cover" />
                )}
                {image.status === 'error' && (
                  <div className="text-center text-gray-500">
                    <X className="w-8 h-8 mx-auto mb-2" />
                    <p className="text-sm">Generation failed</p>
                  </div>
                )}
              </div>
              <div className="p-4">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">{image.prompt}</p>
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-500">
                    {new Date(image.createdAt).toLocaleDateString()}
                  </span>
                  <div className="flex gap-2">
                    {image.status === 'ready' && image.base64 && (
                      <Button variant="ghost" size="icon" onClick={() => {
                        const link = document.createElement('a');
                        link.href = image.base64;
                        link.download = `generated-image-${image.id}.jpg`;
                        link.click();
                      }}>
                        <Download className="w-4 h-4" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" onClick={() => deleteImage(image.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>

        {images.length === 0 && (
          <div className="text-center py-12">
            <Image className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No images generated yet</h3>
            <p className="text-gray-500 dark:text-gray-400">Create your first AI-generated image above</p>
          </div>
        )}
      </div>
    );
  };

  // Workflows View
  const WorkflowsView: React.FC = () => {
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newWorkflow, setNewWorkflow] = useState({ name: '', webhookUrl: '' });
    const [testMessage, setTestMessage] = useState('');
    const [testingWorkflow, setTestingWorkflow] = useState<string | null>(null);
    const [testResults, setTestResults] = useState<Record<string, string>>({});

    const createWorkflow = useCallback(() => {
      if (!newWorkflow.name.trim() || !newWorkflow.webhookUrl.trim()) return;

      const workflow: Workflow = {
        id: Date.now().toString(),
        name: newWorkflow.name.trim(),
        webhookUrl: newWorkflow.webhookUrl.trim()
      };

      setWorkflows(prev => [...prev, workflow]);
      setNewWorkflow({ name: '', webhookUrl: '' });
      setShowCreateModal(false);
    }, [newWorkflow, setWorkflows]);

    const deleteWorkflow = useCallback((id: string) => {
      setWorkflows(prev => prev.filter(w => w.id !== id));
    }, [setWorkflows]);

    const testWorkflow = useCallback(async (workflow: Workflow) => {
      if (!testMessage.trim() || testingWorkflow) return;

      setTestingWorkflow(workflow.id);
      try {
        const result = await postToWebhook(workflow.webhookUrl, testMessage, settings.makeApiKey);
        setTestResults(prev => ({ ...prev, [workflow.id]: result }));
      } catch (error) {
        setTestResults(prev => ({ 
          ...prev, 
          [workflow.id]: `Error: ${error instanceof Error ? error.message : 'Unknown error'}` 
        }));
      } finally {
        setTestingWorkflow(null);
      }
    }, [testMessage, testingWorkflow, settings.makeApiKey]);

    return (
      <div className="p-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">Workflows</h1>
            <p className="text-gray-600 dark:text-gray-400">Automate tasks with Make.com webhooks</p>
          </div>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Workflow
          </Button>
        </div>

        {!settings.makeApiKey && (
          <Card className="p-6 mb-6 border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20">
            <div className="flex items-center gap-3">
              <HelpCircle className="w-5 h-5 text-yellow-600 dark:text-yellow-400" />
              <div>
                <h3 className="font-semibold text-yellow-800 dark:text-yellow-200">API Key Required</h3>
                <p className="text-sm text-yellow-700 dark:text-yellow-300">
                  Configure your Make.com API key in Settings to test workflows.
                </p>
              </div>
            </div>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          {workflows.map(workflow => (
            <Card key={workflow.id} className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-lg">{workflow.name}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 break-all">{workflow.webhookUrl}</p>
                </div>
                <Button variant="ghost" size="icon" onClick={() => deleteWorkflow(workflow.id)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>

              {settings.makeApiKey && (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <Input
                      value={testMessage}
                      onChange={(e) => setTestMessage(e.target.value)}
                      placeholder="Test message..."
                      className="flex-1"
                    />
                    <Button 
                      onClick={() => testWorkflow(workflow)}
                      disabled={!testMessage.trim() || testingWorkflow === workflow.id}
                      size="sm"
                    >
                      {testingWorkflow === workflow.id ? (
                        <Loader className="w-4 h-4" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                    </Button>
                  </div>

                  {testResults[workflow.id] && (
                    <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-lg">
                      <p className="text-sm font-medium mb-1">Response:</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                        {testResults[workflow.id]}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>

        {workflows.length === 0 && (
          <div className="text-center py-12">
            <Zap className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No workflows created yet</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-4">Create your first workflow to automate tasks</p>
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Workflow
            </Button>
          </div>
        )}

        {/* Create Workflow Modal */}
        <Modal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)} title="Create New Workflow">
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Workflow Name</label>
              <Input
                value={newWorkflow.name}
                onChange={(e) => setNewWorkflow(prev => ({ ...prev, name: e.target.value }))}
                placeholder="My Workflow"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">Webhook URL</label>
              <Input
                value={newWorkflow.webhookUrl}
                onChange={(e) => setNewWorkflow(prev => ({ ...prev, webhookUrl: e.target.value }))}
                placeholder="https://hook.make.com/..."
              />
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="secondary" onClick={() => setShowCreateModal(false)}>
                Cancel
              </Button>
              <Button 
                onClick={createWorkflow}
                disabled={!newWorkflow.name.trim() || !newWorkflow.webhookUrl.trim()}
              >
                Create
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    );
  };

  // Agents View
  const AgentsView: React.FC = () => {
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
    const [newAgent, setNewAgent] = useState({
      name: '',
      avatarColor: AVATAR_COLORS[0],
      model: 'gemini-2.5-flash' as const,
      systemInstruction: ''
    });

    const createAgent = useCallback(() => {
      if (!newAgent.name.trim()) return;

      const agent: Agent = {
        id: Date.now().toString(),
        name: newAgent.name.trim(),
        avatarColor: newAgent.avatarColor,
        model: newAgent.model,
        systemInstruction: newAgent.systemInstruction.trim() || DEFAULT_SYSTEM_PROMPT
      };

      setAgents(prev => [...prev, agent]);
      setNewAgent({
        name: '',
        avatarColor: AVATAR_COLORS[0],
        model: 'gemini-2.5-flash',
        systemInstruction: ''
      });
      setShowCreateModal(false);
    }, [newAgent, setAgents]);

    const updateAgent = useCallback(() => {
      if (!editingAgent || !newAgent.name.trim()) return;

      const updatedAgent: Agent = {
        ...editingAgent,
        name: newAgent.name.trim(),
        avatarColor: newAgent.avatarColor,
        model: newAgent.model,
        systemInstruction: newAgent.systemInstruction.trim() || DEFAULT_SYSTEM_PROMPT
      };

      setAgents(prev => prev.map(a => a.id === editingAgent.id ? updatedAgent : a));
      setEditingAgent(null);
      setNewAgent({
        name: '',
        avatarColor: AVATAR_COLORS[0],
        model: 'gemini-2.5-flash',
        systemInstruction: ''
      });
    }, [editingAgent, newAgent, setAgents]);

    const deleteAgent = useCallback((id: string) => {
      setAgents(prev => prev.filter(a => a.id !== id));
    }, [setAgents]);

    const startEditingAgent = useCallback((agent: Agent) => {
      setEditingAgent(agent);
      setNewAgent({
        name: agent.name,
        avatarColor: agent.avatarColor,
        model: agent.model,
        systemInstruction: agent.systemInstruction
      });
    }, []);

    return (
      <div className="p-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">AI Agents</h1>
            <p className="text-gray-600 dark:text-gray-400">Create specialized AI assistants</p>
          </div>
          <Button onClick={() => setShowCreateModal(true)}>
            <Plus className="w-4 h-4 mr-2" />
            New Agent
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {agents.map(agent => (
            <Card key={agent.id} className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div 
                    className="w-10 h-10 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: agent.avatarColor }}
                  >
                    <Bot className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{agent.name}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {MODELS.find(m => m.value === agent.model)?.label}
                    </p>
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => startEditingAgent(agent)}>
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => deleteAgent(agent.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              
              <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-3">
                {agent.systemInstruction}
              </p>
            </Card>
          ))}
        </div>

        {agents.length === 0 && (
          <div className="text-center py-12">
            <Bot className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">No agents created yet</h3>
            <p className="text-gray-500 dark:text-gray-400 mb-4">Create your first AI agent</p>
            <Button onClick={() => setShowCreateModal(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create Agent
            </Button>
          </div>
        )}

        {/* Create/Edit Agent Modal */}
        <Modal 
          isOpen={showCreateModal || !!editingAgent} 
          onClose={() => {
            setShowCreateModal(false);
            setEditingAgent(null);
            setNewAgent({
              name: '',
              avatarColor: AVATAR_COLORS[0],
              model: 'gemini-2.5-flash',
              systemInstruction: ''
            });
          }} 
          title={editingAgent ? 'Edit Agent' : 'Create New Agent'}
        >
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">Agent Name</label>
              <Input
                value={newAgent.name}
                onChange={(e) => setNewAgent(prev => ({ ...prev, name: e.target.value }))}
                placeholder="My AI Assistant"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Avatar Color</label>
              <div className="flex gap-2">
                {AVATAR_COLORS.map(color => (
                  <button
                    key={color}
                    className={`w-8 h-8 rounded-full border-2 ${
                      newAgent.avatarColor === color ? 'border-gray-400' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: color }}
                    onClick={() => setNewAgent(prev => ({ ...prev, avatarColor: color }))}
                  />
                ))}
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">Model</label>
              <Select
                value={newAgent.model}
                onChange={(e) => setNewAgent(prev => ({ ...prev, model: e.target.value as any }))}
              >
                {MODELS.map(model => (
                  <option key={model.value} value={model.value}>{model.label}</option>
                ))}
              </Select>
            </div>
            
            <div>
              <label className="block text-sm font-medium mb-2">System Instruction</label>
              <Textarea
                value={newAgent.systemInstruction}
                onChange={(e) => setNewAgent(prev => ({ ...prev, systemInstruction: e.target.value }))}
                placeholder="You are a helpful assistant specialized in..."
                rows={4}
              />
            </div>
            
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="secondary" onClick={() => {
                setShowCreateModal(false);
                setEditingAgent(null);
                setNewAgent({
                  name: '',
                  avatarColor: AVATAR_COLORS[0],
                  model: 'gemini-2.5-flash',
                  systemInstruction: ''
                });
              }}>
                Cancel
              </Button>
              <Button 
                onClick={editingAgent ? updateAgent : createAgent}
                disabled={!newAgent.name.trim()}
              >
                {editingAgent ? 'Update' : 'Create'}
              </Button>
            </div>
          </div>
        </Modal>
      </div>
    );
  };

  // Settings View
  const SettingsView: React.FC = () => {
    const [showApiKey, setShowApiKey] = useState(false);

    const updateSettings = useCallback((updates: Partial<typeof settings>) => {
      setSettings(prev => ({ ...prev, ...updates }));
    }, [setSettings]);

    return (
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Settings</h1>
          <p className="text-gray-600 dark:text-gray-400">Configure your AI automation platform</p>
        </div>

        <div className="max-w-2xl space-y-6">
          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">API Configuration</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Make.com API Key</label>
                <div className="flex gap-2">
                  <Input
                    type={showApiKey ? 'text' : 'password'}
                    value={settings.makeApiKey}
                    onChange={(e) => updateSettings({ makeApiKey: e.target.value })}
                    placeholder="Enter your Make.com API key"
                    className="flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowApiKey(!showApiKey)}
                  >
                    {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Required for workflow testing and automation
                </p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Default Chat Settings</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Default Model</label>
                <Select
                  value={settings.defaultModel}
                  onChange={(e) => updateSettings({ defaultModel: e.target.value as any })}
                >
                  {MODELS.map(model => (
                    <option key={model.value} value={model.value}>{model.label}</option>
                  ))}
                </Select>
              </div>
              
              <Slider
                label="Default Temperature"
                value={settings.defaultTemperature}
                min={0}
                max={1}
                step={0.1}
                onChange={(e) => updateSettings({ defaultTemperature: parseFloat(e.target.value) })}
              />
              
              <Slider
                label="Default Top P"
                value={settings.defaultTopP}
                min={0}
                max={1}
                step={0.1}
                onChange={(e) => updateSettings({ defaultTopP: parseFloat(e.target.value) })}
              />
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Data Management</h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Export Data</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Download all your conversations and settings</p>
                </div>
                <Button variant="secondary" onClick={() => {
                  const data = {
                    conversations,
                    images,
                    workflows,
                    agents,
                    settings,
                    exportDate: new Date().toISOString()
                  };
                  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `model-lab-export-${new Date().toISOString().split('T')[0]}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}>
                  <Download className="w-4 h-4 mr-2" />
                  Export
                </Button>
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Clear All Data</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Remove all conversations, images, and settings</p>
                </div>
                <Button variant="danger" onClick={() => {
                  if (confirm('Are you sure? This will delete all your data permanently.')) {
                    localStorage.clear();
                    window.location.reload();
                  }
                }}>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Clear All
                </Button>
              </div>
            </div>
          </Card>
        </div>
      </div>
    );
  };

  // Render current view
  const renderCurrentView = () => {
    switch (currentView) {
      case 'home': return <DashboardView />;
      case 'chat': return <ChatView />;
      case 'images': return <ImageView />;
      case 'workflows': return <WorkflowsView />;
      case 'agents': return <AgentsView />;
      case 'settings': return <SettingsView />;
      default: return <DashboardView />;
    }
  };

  return (
    <div className="h-screen flex bg-white dark:bg-black text-black dark:text-white">
      <Sidebar />
      <main className="flex-1 overflow-hidden">
        {renderCurrentView()}
      </main>
    </div>
  );
};

export default App;