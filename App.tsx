
import React, { useState, useEffect, useCallback, useMemo, useRef, type ReactNode } from 'react';
import { HashRouter, Routes, Route, Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import type { Message, Conversation, ImageObject, Workflow, Agent } from './types';
import * as Icons from './components/icons';
import * as UI from './components/ui';
import { streamChat, generateImages, getTitleForChat, postToWebhook } from './services/geminiService';

// --- HOOKS ---
function useLocalStorage<T>(key: string, initialValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
    const [storedValue, setStoredValue] = useState<T>(() => {
      if (typeof window === 'undefined') {
        return initialValue;
      }
      try {
        const item = window.localStorage.getItem(key);
        return item ? JSON.parse(item) : initialValue;
      } catch (error) {
        console.error(error);
        return initialValue;
      }
    });
  
    const setValue: React.Dispatch<React.SetStateAction<T>> = (value) => {
      try {
        const valueToStore = value instanceof Function ? value(storedValue) : value;
        setStoredValue(valueToStore);
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(key, JSON.stringify(valueToStore));
        }
      } catch (error) {
        console.error(error);
      }
    };
  
    return [storedValue, setValue];
}


// --- THEME MANAGEMENT ---
const ThemeContext = React.createContext({ theme: 'dark', toggleTheme: () => {} });
const useTheme = () => React.useContext(ThemeContext);

const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setTheme] = useLocalStorage('theme', 'dark');

  useEffect(() => {
    const root = window.document.documentElement;
    const isDark = theme === 'dark';
    root.classList.toggle('dark', isDark);
    root.classList.toggle('light', !isDark);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prevTheme) => (prevTheme === 'light' ? 'dark' : 'light'));
  }, [setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

// --- GLOBAL APP STATE ---
interface AppContextType {
    conversations: Conversation[];
    setConversations: React.Dispatch<React.SetStateAction<Conversation[]>>;
    activeConversationId: string | null;
    setActiveConversationId: React.Dispatch<React.SetStateAction<string | null>>;
    images: ImageObject[];
    setImages: React.Dispatch<React.SetStateAction<ImageObject[]>>;
    workflows: Workflow[];
    setWorkflows: React.Dispatch<React.SetStateAction<Workflow[]>>;
    agents: Agent[];
    setAgents: React.Dispatch<React.SetStateAction<Agent[]>>;
    makeApiKey: string;
    setMakeApiKey: React.Dispatch<React.SetStateAction<string>>;
    clearAllData: () => void;
}
const AppContext = React.createContext<AppContextType | null>(null);
export const useApp = () => {
    const context = React.useContext(AppContext);
    if (!context) throw new Error("useApp must be used within an AppProvider");
    return context;
};

const AppProvider = ({ children }: { children: ReactNode }) => {
    const [conversations, setConversations] = useLocalStorage<Conversation[]>('conversations', []);
    const [activeConversationId, setActiveConversationId] = useLocalStorage<string | null>('activeConversationId', null);
    const [images, setImages] = useLocalStorage<ImageObject[]>('images', []);
    const [workflows, setWorkflows] = useLocalStorage<Workflow[]>('workflows', [
        {id: '1', name: 'Summarize recent emails', webhookUrl: 'https://hook.make.com/xyz123'},
        {id: '2', name: 'List today’s tasks', webhookUrl: 'https://hook.make.com/abc456'},
    ]);
    const [agents, setAgents] = useLocalStorage<Agent[]>('agents', [
        { id: '1', name: 'Creative Writer', avatarColor: 'bg-blue-500', model: 'gemini-2.5-flash', systemInstruction: 'You are a creative writer for short stories.' },
        { id: '2', name: 'Code Reviewer', avatarColor: 'bg-green-500', model: 'gemini-2.5-flash', systemInstruction: 'You are an expert code reviewer. Provide constructive feedback.' },
    ]);
    const [makeApiKey, setMakeApiKey] = useLocalStorage<string>('makeApiKey', '83f8c85c-3fae-446e-973f-7b9daf9ff3e4');


    const clearAllData = () => {
        setConversations([]);
        setActiveConversationId(null);
        setImages([]);
        setWorkflows([]);
        setAgents([]);
        setMakeApiKey('');
    };

    const value = useMemo(() => ({
        conversations, setConversations,
        activeConversationId, setActiveConversationId,
        images, setImages,
        workflows, setWorkflows,
        agents, setAgents,
        makeApiKey, setMakeApiKey,
        clearAllData,
    }), [conversations, activeConversationId, images, workflows, agents, makeApiKey, setConversations, setActiveConversationId, setImages, setWorkflows, setAgents, setMakeApiKey]);


    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

// --- LAYOUT COMPONENTS ---

const NavItem = ({ to, icon, children }: { to: string; icon: ReactNode; children: ReactNode; }) => (
  <NavLink
    to={to}
    className={({ isActive }) =>
      `flex items-center px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
        isActive
          ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-50'
          : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
      }`
    }
  >
    {icon}
    <span className="ml-3">{children}</span>
  </NavLink>
);

const Sidebar = () => {
  const { theme, toggleTheme } = useTheme();

  const navItems = [
    { to: '/', icon: <Icons.Home className="w-5 h-5" />, label: 'Dashboard' },
    { to: '/chat', icon: <Icons.MessageSquare className="w-5 h-5" />, label: 'Chat' },
    { to: '/images', icon: <Icons.Image className="w-5 h-5" />, label: 'Images' },
    { to: '/workflows', icon: <Icons.Zap className="w-5 h-5" />, label: 'Workflows' },
    { to: '/agents', icon: <Icons.Bot className="w-5 h-5" />, label: 'Agent Lab' },
    { to: '/assistant', icon: <Icons.HelpCircle className="w-5 h-5" />, label: 'Assistant' },
  ];

  return (
    <aside className="fixed inset-y-0 left-0 z-10 hidden w-64 flex-col border-r border-gray-200 dark:border-gray-800 bg-white dark:bg-black md:flex">
      <div className="flex flex-col flex-grow p-4">
        <Link to="/" className="flex items-center gap-2 px-2 mb-6">
            <Icons.Bot className="w-8 h-8 text-white bg-black dark:bg-white dark:text-black p-1 rounded-lg" />
            <h1 className="text-xl font-bold">Model Lab 2.0</h1>
        </Link>
        <nav className="flex-1 space-y-2">
            {navItems.map(item => <NavItem key={item.to} to={item.to} icon={item.icon}>{item.label}</NavItem>)}
        </nav>
        <div className="mt-auto space-y-2">
            <NavItem to="/settings" icon={<Icons.Settings className="w-5 h-5" />}>Settings</NavItem>
            <button
                onClick={toggleTheme}
                className="w-full flex items-center px-4 py-2.5 text-sm font-medium rounded-lg transition-colors text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800"
            >
                {theme === 'light' ? <Icons.Moon className="w-5 h-5" /> : <Icons.Sun className="w-5 h-5" />}
                <span className="ml-3">Toggle Theme</span>
            </button>
        </div>
      </div>
    </aside>
  );
};

const Header = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const isRoot = location.pathname === '/';

    const getTitle = () => {
        const path = location.pathname.split('/')[1];
        if (!path) return 'Dashboard';
        if (path === 'chat' && location.pathname.split('/')[2]) return 'Chat';
        return path.charAt(0).toUpperCase() + path.slice(1);
    };

    if (isRoot) return null;

    return (
        <header className="flex items-center h-16 px-6 border-b border-gray-200 dark:border-gray-800 shrink-0">
            <UI.Button variant="ghost" size="icon" className="mr-4 rounded-full w-10 h-10 md:hidden" onClick={() => navigate(-1)}>
                <Icons.ArrowLeft className="w-5 h-5"/>
            </UI.Button>
            <h2 className="text-lg font-semibold">{getTitle()}</h2>
        </header>
    );
}

const Layout = () => (
    <div className="min-h-screen">
      <Sidebar />
      <main className="md:pl-64 flex flex-col h-screen">
        <Header />
        <div className="flex-grow overflow-y-auto p-4 sm:p-6 lg:p-8">
            <Outlet />
        </div>
      </main>
    </div>
  );

// --- PAGES ---

const Dashboard = () => {
    const navigate = useNavigate();
    const { conversations, images } = useApp();
    const recentActivity = [...conversations, ...images]
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 3);
    
    return (
        <div className="flex flex-col items-center justify-center h-full">
            <div className="text-center mb-12">
                <h1 className="text-4xl md:text-5xl font-bold tracking-tight">Model Automation Lab 2.0</h1>
                <p className="mt-4 text-lg text-gray-600 dark:text-gray-400">Your central hub for AI-powered tasks.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl">
                <UI.Card onClick={() => navigate('/chat')} className="p-8 flex flex-col items-center justify-center text-center hover:bg-gray-50 dark:hover:bg-gray-900 cursor-pointer transition-colors duration-200">
                    <Icons.MessageSquare className="w-12 h-12 mb-4 text-gray-500"/>
                    <h2 className="text-2xl font-semibold">Chat with AI</h2>
                    <p className="mt-2 text-gray-500 dark:text-gray-400">Start a new conversation.</p>
                </UI.Card>
                <UI.Card onClick={() => navigate('/workflows')} className="p-8 flex flex-col items-center justify-center text-center hover:bg-gray-50 dark:hover:bg-gray-900 cursor-pointer transition-colors duration-200">
                    <Icons.Zap className="w-12 h-12 mb-4 text-gray-500"/>
                    <h2 className="text-2xl font-semibold">Run Workflows</h2>
                    <p className="mt-2 text-gray-500 dark:text-gray-400">Automate tasks with Make.com.</p>
                </UI.Card>
            </div>
            <UI.Card className="mt-8 w-full max-w-4xl">
                <div className="p-6">
                    <h3 className="text-xl font-semibold">Recent Activity</h3>
                    {recentActivity.length > 0 ? (
                        <ul className="mt-4 space-y-3">
                            {recentActivity.map(item => (
                                <li key={item.id} className="text-sm flex items-center gap-3">
                                    {'messages' in item ? <Icons.MessageSquare className="w-4 h-4 text-gray-500"/> : <Icons.Image className="w-4 h-4 text-gray-500"/>}
                                    <span className="flex-grow truncate">{'title' in item ? item.title : item.prompt}</span>
                                    <span className="text-xs text-gray-400">{new Date(item.createdAt).toLocaleDateString()}</span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <div className="mt-4 text-center text-gray-500 dark:text-gray-400">
                            <p>No recent activity. Start a chat or run a workflow to get started!</p>
                        </div>
                    )}
                </div>
            </UI.Card>
        </div>
    );
};

const ChatMessage = ({ message }: { message: Message }) => {
    const isModel = message.role === 'model' || message.role === 'workflow';
    const Icon = isModel ? Icons.Bot : Icons.User;
  
    return (
      <div className={`flex items-start gap-4 my-4 ${!isModel ? 'justify-end' : ''}`}>
        {isModel && <Icon className="w-8 h-8 p-1.5 rounded-full bg-gray-200 dark:bg-gray-700 flex-shrink-0" />}
        <div className={`max-w-xl p-4 rounded-xl shadow-sm ${isModel ? 'bg-gray-100 dark:bg-gray-800 rounded-tl-none' : 'bg-blue-500 text-white rounded-br-none'}`}>
          {message.isThinking ? <Icons.Loader className="w-5 h-5"/> : <p className="whitespace-pre-wrap">{message.content}</p>}
        </div>
        {!isModel && <Icon className="w-8 h-8 p-1.5 rounded-full bg-gray-200 dark:bg-gray-700 flex-shrink-0" />}
      </div>
    );
};

const Chat = () => {
    const { conversations, setConversations, activeConversationId, setActiveConversationId } = useApp();
    
    const [chatToRename, setChatToRename] = useState<Conversation | null>(null);
    const [newTitle, setNewTitle] = useState("");
    const [chatToDelete, setChatToDelete] = useState<Conversation | null>(null);

    const createNewChat = () => {
        const newConversation: Conversation = {
            id: Date.now().toString(),
            title: "New Chat",
            messages: [],
            systemPrompt: "You are a helpful AI assistant.",
            temperature: 0.7,
            topP: 0.95,
            createdAt: Date.now(),
        };
        setConversations(prev => [newConversation, ...prev]);
        setActiveConversationId(newConversation.id);
    };

    const handleDeleteChat = (id: string) => {
        setConversations(prev => prev.filter(c => c.id !== id));
        if (activeConversationId === id) {
            setActiveConversationId(null);
        }
        setChatToDelete(null);
    };
    
    const handleRenameChat = () => {
        if (!chatToRename || !newTitle.trim()) return;
        setConversations(prev => prev.map(c => c.id === chatToRename.id ? { ...c, title: newTitle.trim() } : c));
        setChatToRename(null);
        setNewTitle("");
    };

    const activeConversation = useMemo(() => 
        conversations.find(c => c.id === activeConversationId),
    [conversations, activeConversationId]);
    
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [activeConversation?.messages]);

    const handleSend = async () => {
        if (!input.trim() || isLoading || !activeConversation) return;
        
        const userMessage: Message = { id: Date.now().toString(), role: 'user', content: input };
        
        let conversationToUpdate: Conversation;
        
        // Auto-title generation for the first message
        if (activeConversation.messages.length === 0) {
            const autoTitle = await getTitleForChat(input);
            conversationToUpdate = { ...activeConversation, title: autoTitle, messages: [...activeConversation.messages, userMessage] };
        } else {
            conversationToUpdate = { ...activeConversation, messages: [...activeConversation.messages, userMessage] };
        }

        setConversations(prev => prev.map(c => c.id === activeConversation.id ? conversationToUpdate : c));
        
        setInput('');
        setIsLoading(true);
        setError(null);
        
        const modelThinkingMessage: Message = { id: (Date.now() + 1).toString(), role: 'model', content: '', isThinking: true };
        setConversations(prev => prev.map(c => c.id === activeConversation.id ? { ...c, messages: [...c.messages, modelThinkingMessage] } : c));

        try {
            const stream = await streamChat(conversationToUpdate);
            let fullResponse = '';
            let firstChunk = true;

            for await (const chunk of stream) {
                fullResponse += chunk.text;
                if (firstChunk) {
                    const finalModelMessage: Message = { id: modelThinkingMessage.id, role: 'model', content: fullResponse, isThinking: false };
                    setConversations(prev => prev.map(c => c.id === activeConversation.id 
                        ? { ...c, messages: [...c.messages.slice(0, -1), finalModelMessage] } 
                        : c));
                    firstChunk = false;
                } else {
                    setConversations(prev => prev.map(c => {
                        if (c.id === activeConversation.id) {
                            const newMessages = [...c.messages];
                            const lastMessage = newMessages[newMessages.length - 1];
                            // FIX: Replace the last message object immutably instead of mutating it.
                            // This also implicitly guards against an empty array (lastMessage would be undefined).
                            if (lastMessage) {
                                newMessages[newMessages.length - 1] = { ...lastMessage, content: fullResponse };
                            }
                            return { ...c, messages: newMessages };
                        }
                        return c;
                    }));
                }
            }
        } catch (e) {
            setError(e instanceof Error ? e.message : "An unknown error occurred.");
            const errorContent = e instanceof Error ? e.message : "An unknown error occurred.";
            const errorMessage: Message = { id: modelThinkingMessage.id, role: 'model', content: `Error: ${errorContent}`, isThinking: false };
             setConversations(prev => prev.map(c => c.id === activeConversation.id 
                ? { ...c, messages: [...c.messages.slice(0,-1), errorMessage] }
                : c));
        } finally {
            setIsLoading(false);
        }
    };
    
    const updateConversationSettings = (updates: Partial<Conversation>) => {
        if (!activeConversationId) return;
        setConversations(prev => prev.map(c => c.id === activeConversationId ? {...c, ...updates} : c));
    }

    return (
        <>
            <div className="flex h-[calc(100vh-4rem-1px)]">
                {/* Conversations Sidebar */}
                <aside className="w-80 border-r border-gray-200 dark:border-gray-800 flex flex-col p-4">
                    <UI.Button onClick={createNewChat} className="w-full mb-4">
                        <Icons.Plus className="w-4 h-4 mr-2"/> New Chat
                    </UI.Button>
                    <div className="flex-1 overflow-y-auto space-y-2">
                        {conversations.sort((a,b) => b.createdAt - a.createdAt).map(c => (
                            <div key={c.id} onClick={() => setActiveConversationId(c.id)}
                                className={`group p-3 rounded-lg cursor-pointer transition-colors flex justify-between items-center ${activeConversationId === c.id ? 'bg-gray-100 dark:bg-gray-800' : 'hover:bg-gray-50 dark:hover:bg-gray-900'}`}>
                                <p className="text-sm font-medium truncate">{c.title}</p>
                                <div className="opacity-0 group-hover:opacity-100 flex gap-1">
                                    <UI.Button variant="ghost" size="icon" className="w-7 h-7" onClick={(e) => { e.stopPropagation(); setNewTitle(c.title); setChatToRename(c);}}>
                                        <Icons.Edit className="w-4 h-4" />
                                    </UI.Button>
                                    <UI.Button variant="ghost" size="icon" className="w-7 h-7 hover:bg-red-500/10" onClick={(e) => { e.stopPropagation(); setChatToDelete(c); }}>
                                        <Icons.Trash2 className="w-4 h-4 text-gray-500 dark:text-gray-400 group-hover:text-red-500" />
                                    </UI.Button>
                                </div>
                            </div>
                        ))}
                    </div>
                </aside>
                
                {/* Main Chat View */}
                <div className="flex flex-col flex-1 h-full">
                    {activeConversation ? (
                        <>
                            <div className="flex-1 overflow-y-auto px-6">
                                {activeConversation.messages.map((msg) => <ChatMessage key={msg.id} message={msg} />)}
                                <div ref={messagesEndRef} />
                            </div>
                            {error && <div className="text-red-500 p-2 text-center border-t border-gray-200 dark:border-gray-800">{error}</div>}
                            <div className="mt-auto p-6 border-t border-gray-200 dark:border-gray-800">
                                <div className="flex items-center gap-2">
                                    <UI.Input 
                                        value={input} 
                                        onChange={(e) => setInput(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), handleSend())}
                                        placeholder="Type your message..."
                                        disabled={isLoading}
                                        className="flex-1"
                                    />
                                    <UI.Button onClick={handleSend} disabled={isLoading || !input.trim()}>
                                        {isLoading ? <Icons.Loader className="w-5 h-5" /> : <Icons.Send className="w-5 h-5"/>}
                                    </UI.Button>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-gray-500 dark:text-gray-400">
                            <Icons.MessageSquare className="w-16 h-16 mb-4"/>
                            <h2 className="text-2xl font-semibold">Select a conversation</h2>
                            <p>Or start a new one to begin chatting.</p>
                        </div>
                    )}
                </div>

                {/* Settings Sidebar */}
                <aside className="w-80 ml-8 border-l border-gray-200 dark:border-gray-800 pl-8 hidden lg:flex flex-col p-4">
                    <h3 className="text-lg font-semibold mb-4">Settings</h3>
                    {activeConversation ? (
                         <div className="space-y-6">
                            <div>
                                <label className="text-sm font-medium">System Prompt</label>
                                <UI.Textarea 
                                    value={activeConversation.systemPrompt}
                                    onChange={(e) => updateConversationSettings({ systemPrompt: e.target.value })}
                                    className="w-full h-32 mt-1 text-sm"
                                />
                            </div>
                            <UI.Slider label="Temperature" value={activeConversation.temperature} min="0" max="1" step="0.01" onChange={(e) => updateConversationSettings({ temperature: parseFloat(e.target.value) })} />
                            <UI.Slider label="Top P" value={activeConversation.topP} min="0" max="1" step="0.01" onChange={(e) => updateConversationSettings({ topP: parseFloat(e.target.value) })} />
                        </div>
                    ) : (
                        <div className="text-sm text-gray-500">Select a conversation to see its settings.</div>
                    )}
                </aside>
            </div>
            {/* Modals and Dialogs */}
            <UI.Dialog
                isOpen={!!chatToDelete}
                onClose={() => setChatToDelete(null)}
                title="Delete Conversation"
                description={`Are you sure you want to delete the conversation "${chatToDelete?.title}"? This action cannot be undone.`}
                onConfirm={() => chatToDelete && handleDeleteChat(chatToDelete.id)}
                confirmText="Delete"
            />
            <UI.Modal
                isOpen={!!chatToRename}
                onClose={() => setChatToRename(null)}
                title="Rename Conversation"
            >
                <div className="space-y-4">
                    <UI.Input 
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        placeholder="Enter new title"
                        onKeyDown={(e) => e.key === 'Enter' && handleRenameChat()}
                    />
                    <div className="flex justify-end gap-2">
                        <UI.Button variant="secondary" onClick={() => setChatToRename(null)}>Cancel</UI.Button>
                        <UI.Button onClick={handleRenameChat}>Save</UI.Button>
                    </div>
                </div>
            </UI.Modal>
        </>
    );
};

const ImageGeneration = () => {
    const { images, setImages } = useApp();
    const [prompt, setPrompt] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string|null>(null);
    const [lightboxImage, setLightboxImage] = useState<string|null>(null);
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());
    const [isClearGalleryDialogOpen, setIsClearGalleryDialogOpen] = useState(false);
    const [isDeleteSelectedDialogOpen, setIsDeleteSelectedDialogOpen] = useState(false);

    const handleGenerate = async () => {
        if (!prompt.trim() || isLoading) return;
        setIsLoading(true);
        setError(null);
        
        try {
            const imageBytesArray = await generateImages(prompt);
            const newImages: ImageObject[] = imageBytesArray.map((bytes, i) => ({
                id: `ready-${Date.now()}-${i}`,
                prompt: prompt,
                base64: bytes,
                status: 'ready',
                createdAt: Date.now(),
            }));
            setImages(prev => [...newImages, ...prev]);
        } catch (e) {
            setError(e instanceof Error ? e.message : "An unknown error occurred.");
        } finally {
            setIsLoading(false);
        }
    };

    const toggleSelection = (id: string) => {
        setSelectedImages(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) {
                newSet.delete(id);
            } else {
                newSet.add(id);
            }
            return newSet;
        });
    }

    const handleDeleteSelected = () => {
        setImages(prev => prev.filter(img => !selectedImages.has(img.id)));
        setSelectedImages(new Set());
        setSelectionMode(false);
        setIsDeleteSelectedDialogOpen(false);
    }
    
    const handleClearGallery = () => {
        setImages([]);
        setIsClearGalleryDialogOpen(false);
    }

    const downloadImage = (base64: string, prompt: string) => {
        const link = document.createElement('a');
        link.href = `data:image/jpeg;base64,${base64}`;
        const sanitizedPrompt = prompt.slice(0, 20).replace(/[^a-z0-9]/gi, '_').toLowerCase();
        link.download = `img_${sanitizedPrompt}_${Date.now()}.jpeg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const downloadSelected = () => {
        selectedImages.forEach(id => {
            const img = images.find(i => i.id === id);
            if (img) {
                downloadImage(img.base64, img.prompt);
            }
        });
    }

    return (
        <>
            <div className="flex gap-8">
                <div className="flex-1">
                    <div className="flex gap-2 mb-8">
                        <UI.Input 
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                            placeholder="A robot holding a red skateboard..."
                            disabled={isLoading}
                            className="flex-1"
                        />
                        <UI.Button onClick={handleGenerate} disabled={isLoading || !prompt.trim()} className="w-32">
                            {isLoading ? <Icons.Loader className="w-5 h-5" /> : 'Generate'}
                        </UI.Button>
                    </div>

                    {error && <div className="text-red-500 p-4 text-center bg-red-500/10 rounded-lg mb-4">{error}</div>}
                    
                    {images.length === 0 && !isLoading && (
                         <div className="flex flex-col items-center justify-center h-[calc(100vh-15rem)] text-gray-500">
                            <Icons.Image className="w-16 h-16 mb-4"/>
                            <h2 className="text-2xl font-semibold">Image Gallery</h2>
                            <p>Generated images will appear here.</p>
                        </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {images.sort((a,b) => b.createdAt - a.createdAt).map(img => (
                            <UI.Card key={img.id} className="group relative aspect-square overflow-hidden cursor-pointer" onClick={() => !selectionMode && setLightboxImage(img.base64)}>
                                <img src={`data:image/jpeg;base64,${img.base64}`} alt={img.prompt} className={`w-full h-full object-cover transition-all duration-300 group-hover:scale-105 ${selectionMode && selectedImages.has(img.id) ? 'scale-90 opacity-70' : ''}`} />
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-between p-4">
                                    <p className="text-white text-sm line-clamp-3">{img.prompt}</p>
                                    <div className="flex gap-2 self-end">
                                        <UI.Button variant="ghost" size="icon" className="bg-black/50 text-white rounded-full w-9 h-9" onClick={(e) => { e.stopPropagation(); downloadImage(img.base64, img.prompt) }}><Icons.Download className="w-4 h-4"/></UI.Button>
                                        <UI.Button variant="ghost" size="icon" className="bg-black/50 text-white rounded-full w-9 h-9" onClick={(e) => { e.stopPropagation(); setPrompt(img.prompt) }}><Icons.RefreshCw className="w-4 h-4"/></UI.Button>
                                    </div>
                                </div>
                                {selectionMode && (
                                    <div className="absolute top-2 right-2" onClick={(e) => {e.stopPropagation(); toggleSelection(img.id)}}>
                                        {selectedImages.has(img.id) ? <Icons.CheckSquare className="w-6 h-6 text-white bg-blue-500 rounded-md"/> : <Icons.Square className="w-6 h-6 text-white bg-black/50 rounded-md"/>}
                                    </div>
                                )}
                            </UI.Card>
                        ))}
                    </div>
                </div>
                
                <aside className="w-64 hidden lg:block">
                    <h3 className="text-lg font-semibold mb-4">Gallery Tools</h3>
                    <div className="space-y-4">
                        <UI.Button variant="secondary" className="w-full" onClick={() => { setSelectionMode(!selectionMode); setSelectedImages(new Set()) }}>{selectionMode ? "Cancel Selection" : "Select Images"}</UI.Button>
                        {selectionMode && selectedImages.size > 0 && (
                            <>
                                <UI.Button className="w-full" onClick={downloadSelected}>Download ({selectedImages.size})</UI.Button>
                                <UI.Button variant="danger" className="w-full" onClick={() => setIsDeleteSelectedDialogOpen(true)}>Delete ({selectedImages.size})</UI.Button>
                            </>
                        )}
                        <UI.Button variant="danger" className="w-full !mt-8" onClick={() => setIsClearGalleryDialogOpen(true)} disabled={images.length === 0}>Clear Gallery</UI.Button>
                    </div>
                </aside>

                {lightboxImage && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={() => setLightboxImage(null)}>
                        <img src={`data:image/jpeg;base64,${lightboxImage}`} alt="Lightbox view" className="max-w-[90vw] max-h-[90vh] rounded-lg shadow-2xl"/>
                        <UI.Button variant="ghost" size="icon" className="absolute top-4 right-4 bg-black/50 text-white rounded-full" onClick={() => setLightboxImage(null)}><Icons.X/></UI.Button>
                    </div>
                )}
            </div>
            
            <UI.Dialog
                isOpen={isClearGalleryDialogOpen}
                onClose={() => setIsClearGalleryDialogOpen(false)}
                title="Clear Entire Gallery?"
                description="Are you sure you want to delete all generated images? This action cannot be undone."
                onConfirm={handleClearGallery}
                confirmText="Yes, delete all"
            />
            <UI.Dialog
                isOpen={isDeleteSelectedDialogOpen}
                onClose={() => setIsDeleteSelectedDialogOpen(false)}
                title={`Delete ${selectedImages.size} images?`}
                description="Are you sure you want to delete the selected images? This action cannot be undone."
                onConfirm={handleDeleteSelected}
                confirmText="Delete"
            />
        </>
    );
};


const Workflows = () => {
    const { workflows, setWorkflows } = useApp();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingWorkflow, setEditingWorkflow] = useState<Workflow | null>(null);
    const [workflowToDelete, setWorkflowToDelete] = useState<Workflow | null>(null);
    const [formState, setFormState] = useState({ name: '', url: '' });
    const [activeWorkflow, setActiveWorkflow] = useState<Workflow | null>(null);

    const openModal = (wf: Workflow | null) => {
        setEditingWorkflow(wf);
        setFormState({ name: wf?.name || '', url: wf?.webhookUrl || '' });
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingWorkflow(null);
        setFormState({ name: '', url: '' });
    };

    const handleSave = () => {
        if (formState.name.trim() && formState.url.trim()) {
            if (editingWorkflow) {
                setWorkflows(prev => prev.map(w => w.id === editingWorkflow.id ? { ...w, name: formState.name, webhookUrl: formState.url } : w));
            } else {
                setWorkflows(prev => [...prev, {id: Date.now().toString(), name: formState.name, webhookUrl: formState.url}]);
            }
            closeModal();
        }
    };

    const handleDelete = (id: string) => {
        setWorkflows(prev => prev.filter(w => w.id !== id));
        setWorkflowToDelete(null);
    };
    
    // Workflow Chat Modal Component
    const WorkflowChatModal = ({ workflow, onClose }: { workflow: Workflow, onClose: () => void }) => {
        const { makeApiKey } = useApp();
        const [messages, setMessages] = useState<Message[]>([]);
        const [input, setInput] = useState('');
        const [isLoading, setIsLoading] = useState(false);

        const handleSend = async () => {
            if (!input.trim() || isLoading) return;
            const userMessage: Message = { id: Date.now().toString(), role: 'user', content: input };
            setMessages(prev => [...prev, userMessage]);
            setInput('');
            setIsLoading(true);

            try {
                const responseText = await postToWebhook(workflow.webhookUrl, input, makeApiKey);
                const workflowMessage: Message = { id: (Date.now() + 1).toString(), role: 'workflow', content: responseText };
                setMessages(prev => [...prev, workflowMessage]);
            } catch (error) {
                const errorMessage: Message = { id: (Date.now() + 1).toString(), role: 'workflow', content: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`};
                setMessages(prev => [...prev, errorMessage]);
            } finally {
                setIsLoading(false);
            }
        }
        
        return (
            <UI.Modal isOpen={!!workflow} onClose={onClose} title={`Workflow: ${workflow.name}`}>
                <div className="flex flex-col h-[60vh]">
                    <div className="flex-1 overflow-y-auto p-1">
                        {messages.map(msg => <ChatMessage key={msg.id} message={msg}/>)}
                    </div>
                    <div className="mt-auto pt-4 flex gap-2">
                        <UI.Input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSend()} placeholder="Send message to workflow..."/>
                        <UI.Button onClick={handleSend} disabled={isLoading}>{isLoading ? <Icons.Loader className="w-5 h-5"/> : <Icons.Send className="w-5 h-5" />}</UI.Button>
                    </div>
                </div>
            </UI.Modal>
        )
    }

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">Workflows</h2>
                <UI.Button onClick={() => openModal(null)}><Icons.Plus className="w-4 h-4 mr-2"/> Add Workflow</UI.Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {workflows.map(wf => (
                    <UI.Card key={wf.id} className="p-6 flex flex-col justify-between">
                       <div className="flex items-start gap-4">
                            <div className="bg-gray-100 dark:bg-gray-800 p-3 rounded-lg flex-shrink-0">
                                <Icons.Zap className="w-6 h-6 text-gray-600 dark:text-gray-300"/>
                            </div>
                            <div className="flex-grow overflow-hidden">
                                <h3 className="font-semibold truncate">{wf.name}</h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 truncate">{wf.webhookUrl}</p>
                            </div>
                       </div>
                        <div className="flex gap-2 justify-end mt-4">
                            <UI.Button variant="secondary" className="text-xs h-8" onClick={() => openModal(wf)}>Edit</UI.Button>
                            <UI.Button variant="secondary" className="text-xs h-8" onClick={() => setWorkflowToDelete(wf)}>Delete</UI.Button>
                            <UI.Button className="text-xs h-8" onClick={() => setActiveWorkflow(wf)}>Run</UI.Button>
                        </div>
                    </UI.Card>
                ))}
            </div>

            <UI.Modal isOpen={isModalOpen} onClose={closeModal} title={editingWorkflow ? "Edit Workflow" : "Add New Workflow"}>
                <div className="space-y-4">
                    <UI.Input placeholder="Workflow Name" value={formState.name} onChange={e => setFormState({...formState, name: e.target.value})} />
                    <UI.Input placeholder="Webhook URL" value={formState.url} onChange={e => setFormState({...formState, url: e.target.value})} />
                    <div className="flex justify-end gap-2 pt-2">
                        <UI.Button variant="secondary" onClick={closeModal}>Cancel</UI.Button>
                        <UI.Button onClick={handleSave}>{editingWorkflow ? "Save Changes" : "Add Workflow"}</UI.Button>
                    </div>
                </div>
            </UI.Modal>

            <UI.Dialog 
                isOpen={!!workflowToDelete}
                onClose={() => setWorkflowToDelete(null)}
                title="Delete Workflow"
                description={`Are you sure you want to delete the workflow "${workflowToDelete?.name}"?`}
                onConfirm={() => workflowToDelete && handleDelete(workflowToDelete.id)}
            />

            {activeWorkflow && <WorkflowChatModal workflow={activeWorkflow} onClose={() => setActiveWorkflow(null)} />}
        </div>
    );
};

const AgentLab = () => {
    const { agents, setAgents } = useApp();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingAgent, setEditingAgent] = useState<Agent | null>(null);
    const [agentToDelete, setAgentToDelete] = useState<Agent | null>(null);

    const openModal = (agent: Agent | null = null) => {
        setEditingAgent(agent);
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingAgent(null);
    };

    const saveAgent = (agent: Agent) => {
        if (agent.id) {
            setAgents(prev => prev.map(a => a.id === agent.id ? agent : a));
        } else {
            setAgents(prev => [...prev, { ...agent, id: Date.now().toString() }]);
        }
        closeModal();
    };
    
    const handleDeleteAgent = (id: string) => {
        setAgents(prev => prev.filter(a => a.id !== id));
        setAgentToDelete(null);
    }
    
    const AgentFormModal = ({ agent, onSave, onClose }: { agent: Agent | null, onSave: (agent: Agent) => void, onClose: () => void}) => {
        const [formData, setFormData] = useState<Agent>({
            id: agent?.id || '',
            name: agent?.name || '',
            avatarColor: agent?.avatarColor || 'bg-gray-500',
            model: agent?.model || 'gemini-2.5-flash',
            systemInstruction: agent?.systemInstruction || '',
        });

        const handleSubmit = (e: React.FormEvent) => {
            e.preventDefault();
            onSave(formData);
        }

        const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
            setFormData({ ...formData, [e.target.name]: e.target.value });
        }

        const avatarColors = ['bg-blue-500', 'bg-green-500', 'bg-yellow-500', 'bg-purple-500', 'bg-pink-500', 'bg-indigo-500'];

        return (
            <UI.Modal isOpen={true} onClose={onClose} title={agent ? 'Edit Agent' : 'Create Agent'}>
                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="text-sm font-medium">Agent Name</label>
                        <UI.Input name="name" value={formData.name} onChange={handleChange} required/>
                    </div>
                     <div>
                        <label className="text-sm font-medium">Avatar Color</label>
                        <div className="flex gap-2 mt-2">
                           {avatarColors.map(color => (
                               <div key={color} onClick={() => setFormData({...formData, avatarColor: color})}
                                    className={`w-8 h-8 rounded-full cursor-pointer ${color} ${formData.avatarColor === color ? 'ring-2 ring-offset-2 ring-white dark:ring-offset-black' : ''}`}>
                               </div>
                           ))}
                        </div>
                    </div>
                    <div>
                        <label className="text-sm font-medium">Model</label>
                        <UI.Select name="model" value={formData.model} onChange={handleChange}>
                            <option value="gemini-2.5-flash">Gemini 2.5 Flash</option>
                        </UI.Select>
                    </div>
                    <div>
                        <label className="text-sm font-medium">System Instructions</label>
                        <UI.Textarea name="systemInstruction" value={formData.systemInstruction} onChange={handleChange} rows={5} required/>
                    </div>
                    <div className="flex justify-end gap-2 pt-4">
                        <UI.Button type="button" variant="secondary" onClick={onClose}>Cancel</UI.Button>
                        <UI.Button type="submit">Save Agent</UI.Button>
                    </div>
                </form>
            </UI.Modal>
        )
    }

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">Agent Lab</h2>
                <UI.Button onClick={() => openModal()}><Icons.Plus className="w-4 h-4 mr-2"/> New Agent</UI.Button>
            </div>
            <div className="space-y-4">
                {agents.map(agent => (
                    <UI.Card key={agent.id} className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-900 transition-colors">
                        <div className="flex items-center gap-4">
                            <div className={`w-10 h-10 rounded-full ${agent.avatarColor} flex items-center justify-center`}>
                                <Icons.Bot className="w-6 h-6 text-white"/>
                            </div>
                            <div>
                                <h3 className="font-semibold">{agent.name}</h3>
                                <p className="text-sm text-gray-500 dark:text-gray-400">Model: {agent.model}</p>
                            </div>
                        </div>
                        <div className="flex gap-2">
                            <UI.Button variant="secondary" onClick={() => openModal(agent)}>Edit</UI.Button>
                            <UI.Button variant="ghost" className="text-gray-500 hover:text-red-500" onClick={() => setAgentToDelete(agent)}>Delete</UI.Button>
                        </div>
                    </UI.Card>
                ))}
            </div>
            {isModalOpen && <AgentFormModal agent={editingAgent} onSave={saveAgent} onClose={closeModal}/>}
            <UI.Dialog
                isOpen={!!agentToDelete}
                onClose={() => setAgentToDelete(null)}
                title="Delete Agent"
                description={`Are you sure you want to delete the agent "${agentToDelete?.name}"?`}
                onConfirm={() => agentToDelete && handleDeleteAgent(agentToDelete.id)}
            />
        </div>
    );
};

const Assistant = () => (
    <div className="text-center h-full flex items-center justify-center">
        <div>
            <Icons.HelpCircle className="w-16 h-16 mx-auto mb-4 text-gray-400"/>
            <h2 className="text-3xl font-bold">Assistant</h2>
            <p className="mt-2 text-gray-500 dark:text-gray-400">This module is under construction. Come back soon!</p>
        </div>
    </div>
);

const Settings = () => {
    const { theme, toggleTheme } = useTheme();
    const { clearAllData, makeApiKey, setMakeApiKey } = useApp();
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [showMakeKey, setShowMakeKey] = useState(false);


    const handleClearData = () => {
        clearAllData();
        setIsDialogOpen(false);
    }
    
    return (
        <div>
            <h2 className="text-2xl font-bold mb-6">Settings</h2>
            <div className="max-w-2xl space-y-8">
                <UI.Card>
                    <div className="p-6">
                        <h3 className="text-lg font-semibold">API Keys</h3>
                        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                           Your Google Gemini API key is configured securely via an environment variable (`process.env.API_KEY`) and is not exposed here.
                        </p>
                        <div className="border-t border-gray-200 dark:border-gray-700 my-4" />
                        <div>
                            <label htmlFor="make-key" className="text-sm font-medium">Make.com API Key</label>
                            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                Used for triggering your custom workflows.
                            </p>
                            <div className="flex items-center gap-2 mt-2">
                                <UI.Input 
                                    id="make-key"
                                    type={showMakeKey ? 'text' : 'password'}
                                    value={makeApiKey}
                                    onChange={(e) => setMakeApiKey(e.target.value)}
                                    placeholder="Enter your Make.com API key"
                                    className="flex-1"
                                />
                                <UI.Button variant="secondary" size="icon" onClick={() => setShowMakeKey(!showMakeKey)}>
                                    {showMakeKey ? <Icons.EyeOff className="w-5 h-5"/> : <Icons.Eye className="w-5 h-5"/>}
                                </UI.Button>
                            </div>
                        </div>
                    </div>
                </UI.Card>
                <UI.Card>
                    <div className="p-6">
                        <h3 className="text-lg font-semibold">Appearance</h3>
                        <div className="mt-4 flex items-center justify-between">
                            <p className="text-sm">Theme</p>
                            <UI.Button variant="secondary" onClick={toggleTheme}>
                                Switch to {theme === 'light' ? 'Dark' : 'Light'}
                            </UI.Button>
                        </div>
                    </div>
                </UI.Card>
                <UI.Card>
                    <div className="p-6 border border-red-500/30">
                        <h3 className="text-lg font-semibold text-red-500 dark:text-red-400">Danger Zone</h3>
                         <div className="mt-4 flex items-center justify-between">
                            <p className="text-sm">Clear all local data</p>
                            <UI.Button variant="danger" onClick={() => setIsDialogOpen(true)}>
                                Clear Data
                            </UI.Button>
                        </div>
                        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                            This will delete all conversations, images, workflows, and agents from your browser. This action cannot be undone.
                        </p>
                    </div>
                </UI.Card>
            </div>
            <UI.Dialog 
                isOpen={isDialogOpen}
                onClose={() => setIsDialogOpen(false)}
                title="Clear All Data?"
                description="Are you sure you want to delete all your local data? This action cannot be undone."
                onConfirm={handleClearData}
                confirmText="Yes, delete everything"
            />
        </div>
    );
};


function App() {
  return (
    <ThemeProvider>
        <AppProvider>
            <HashRouter>
                <Routes>
                    <Route path="/" element={<Layout />}>
                        <Route index element={<Dashboard />} />
                        <Route path="chat" element={<Chat />} />
                        <Route path="images" element={<ImageGeneration />} />
                        <Route path="workflows" element={<Workflows />} />
                        <Route path="agents" element={<AgentLab />} />
                        <Route path="assistant" element={<Assistant />} />
                        <Route path="settings" element={<Settings />} />
                    </Route>
                </Routes>
            </HashRouter>
        </AppProvider>
    </ThemeProvider>
  );
}

export default App;
