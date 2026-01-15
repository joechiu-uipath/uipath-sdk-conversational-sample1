import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from './context/AuthContext';
import SignIn from './components/SignIn';
import TopBar from './components/TopBar';
import ChatMessages from './components/ChatMessages';
import MessageInput from './components/MessageInput';
import {
  CONVERSATION_FETCH_LIMIT,
  SORT_ORDER,
  MESSAGE_ROLE,
  DEFAULT_CONVERSATION_LABEL,
} from './constants';

export default function App() {
  const { isAuthenticated, isLoading: authLoading, conversationalAgentService } = useAuth();

  const [agents, setAgents] = useState([]);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [selectedConversation, setSelectedConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [isLoadingAgents, setIsLoadingAgents] = useState(false);
  const [isLoadingConversations, setIsLoadingConversations] = useState(false);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSending, setIsSending] = useState(false);

  const sessionHelperRef = useRef(null);
  const sessionStartedRef = useRef(false);

  const loadAgents = useCallback(async () => {
    if (!conversationalAgentService) return;

    setIsLoadingAgents(true);
    try {
      const agentsList = await conversationalAgentService.agents.getAll();
      setAgents(agentsList);
    } catch (error) {
      console.error('Failed to load agents:', error);
    } finally {
      setIsLoadingAgents(false);
    }
  }, [conversationalAgentService]);

  const loadConversations = useCallback(async () => {
    if (!conversationalAgentService || !selectedAgent) return;

    setIsLoadingConversations(true);
    try {
      const response = await conversationalAgentService.conversations.getAll({
        sort: SORT_ORDER.DESCENDING,
        limit: CONVERSATION_FETCH_LIMIT,
      });
      console.log('Conversations response:', response);
      console.log('Selected agent:', selectedAgent);
      const allConversations = Array.isArray(response) ? response : (response?.items || response?.data || []);

      // Log first conversation to see its structure
      if (allConversations.length > 0) {
        console.log('Sample conversation object:', allConversations[0]);
      }

      // Filter conversations by selected agent
      const filteredConversations = allConversations.filter(conv => {
        // Try different possible property names for agent ID
        const convAgentId = conv.agentId || conv.agentReleaseId || conv.agent?.id;
        return convAgentId === selectedAgent.id;
      });

      console.log('Filtered conversations:', filteredConversations.length, 'of', allConversations.length);
      setConversations(filteredConversations);
    } catch (error) {
      console.error('Failed to load conversations:', error);
    } finally {
      setIsLoadingConversations(false);
    }
  }, [conversationalAgentService, selectedAgent]);

  const loadMessages = useCallback(async () => {
    if (!conversationalAgentService || !selectedConversation) return;

    setIsLoadingMessages(true);
    try {
      const response = await conversationalAgentService.conversations.exchanges.getAll(
        selectedConversation.conversationId
      );
      console.log('Exchanges response:', response);

      const exchanges = Array.isArray(response) ? response : (response?.items || response?.data || []);
      // Reverse to get chronological order (older first, newer last)
      const chronologicalExchanges = [...exchanges].reverse();
      const messageList = [];
      for (const exchange of chronologicalExchanges) {
        if (exchange.messages) {
          for (const msg of exchange.messages) {
            const content = msg.contentParts
              ?.map((part) => part.data?.inline || '')
              .join('') || '';
            const citations = msg.contentParts
              ?.flatMap((part) => part.citations || []) || [];
            messageList.push({
              id: msg.messageId,
              role: msg.role,
              content,
              toolCalls: msg.toolCalls || [],
              citations,
            });
          }
        }
      }
      setMessages(messageList);
    } catch (error) {
      console.error('Failed to load messages:', error);
    } finally {
      setIsLoadingMessages(false);
    }
  }, [conversationalAgentService, selectedConversation]);

  const startSession = useCallback(async () => {
    if (!conversationalAgentService || !selectedConversation) return;

    if (sessionHelperRef.current) {
      return;
    }

    try {
      const session = conversationalAgentService.events.startSession({
        conversationId: selectedConversation.conversationId,
      });

      session.onSessionStarted(() => {
        console.log('Session started');
      });

      session.onErrorStart((error) => {
        console.error('Session error:', error);
      });

      session.onLabelUpdated((event) => {
        console.log('Label updated:', event);
        const newLabel = event.label || event.data?.label;
        if (newLabel) {
          // Update the conversations list
          setConversations((prev) =>
            prev.map((conv) =>
              conv.conversationId === selectedConversation.conversationId
                ? { ...conv, label: newLabel }
                : conv
            )
          );
          // Update the selected conversation
          setSelectedConversation((prev) =>
            prev ? { ...prev, label: newLabel } : prev
          );
        }
      });

      sessionHelperRef.current = session;
    } catch (error) {
      console.error('Failed to start session:', error);
    }
  }, [conversationalAgentService, selectedConversation]);

  useEffect(() => {
    if (isAuthenticated) {
      loadAgents();
    }
  }, [isAuthenticated, loadAgents]);

  useEffect(() => {
    if (selectedAgent) {
      setSelectedConversation(null);
      setMessages([]);
      loadConversations();
    }
  }, [selectedAgent, loadConversations]);

  useEffect(() => {
    if (!selectedConversation) return;

    loadMessages();

    if (sessionStartedRef.current) {
      return;
    }
    sessionStartedRef.current = true;
    startSession();

    return () => {
      sessionStartedRef.current = false;
      if (sessionHelperRef.current) {
        sessionHelperRef.current.endSession?.();
        sessionHelperRef.current = null;
      }
    };
  }, [selectedConversation, loadMessages, startSession]);

  const handleAgentChange = (agent) => {
    setSelectedAgent(agent);
  };

  const handleConversationChange = (conversation) => {
    if (sessionHelperRef.current) {
      sessionHelperRef.current.endSession?.();
      sessionHelperRef.current = null;
    }
    sessionStartedRef.current = false;
    setSelectedConversation(conversation);
  };

  const handleNewChat = async () => {
    if (!conversationalAgentService || !selectedAgent) return;

    try {
      const newConversation = await conversationalAgentService.conversations.create({
        agentReleaseId: selectedAgent.id,
        folderId: selectedAgent.folderId,
        label: DEFAULT_CONVERSATION_LABEL,
        autogenerateLabel: true,
      });

      await loadConversations();
      setSelectedConversation(newConversation);
    } catch (error) {
      console.error('Failed to create conversation:', error);
    }
  };

  const handleSendMessage = async (messageText) => {
    if (!sessionHelperRef.current || isSending) return;

    setIsSending(true);

    const userMessageId = `temp-user-${Date.now()}`;
    const assistantMessageId = `temp-assistant-${Date.now()}`;
    const contentRef = { current: '' };

    const userMessage = {
      id: userMessageId,
      role: MESSAGE_ROLE.USER,
      content: messageText,
      toolCalls: [],
      citations: [],
    };

    const assistantMessage = {
      id: assistantMessageId,
      role: MESSAGE_ROLE.ASSISTANT,
      content: '',
      toolCalls: [],
      citations: [],
    };

    setMessages((prev) => [...prev, userMessage, assistantMessage]);

    try {
      const exchange = sessionHelperRef.current.startExchange();

      exchange.onMessageStart((message) => {
        if (message.startEvent.role === MESSAGE_ROLE.ASSISTANT) {
          message.onContentPartStart((contentPart) => {
            contentPart.onChunk((chunk) => {
              contentRef.current += chunk.data || '';
              const newContent = contentRef.current;
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMessageId
                    ? { ...msg, content: newContent }
                    : msg
                )
              );
            });
          });
        }
      });

      exchange.onExchangeEnd(() => {
        setIsSending(false);
      });

      exchange.sendMessageWithContentPart({
        data: messageText,
      });
    } catch (error) {
      console.error('Failed to send message:', error);
      setIsSending(false);
      setMessages((prev) => prev.filter((msg) => msg.id !== assistantMessageId));
    }
  };

  if (authLoading) {
    return (
      <div className="loading-container">
        <div className="loading-spinner">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <SignIn />;
  }

  return (
    <div className="app-container">
      <TopBar
        agents={agents}
        selectedAgent={selectedAgent}
        onAgentChange={handleAgentChange}
        conversations={conversations}
        selectedConversation={selectedConversation}
        onConversationChange={handleConversationChange}
        onNewChat={handleNewChat}
        isLoadingAgents={isLoadingAgents}
        isLoadingConversations={isLoadingConversations}
      />
      <ChatMessages
        messages={messages}
        isLoading={isLoadingMessages}
      />
      <MessageInput
        onSend={handleSendMessage}
        disabled={!selectedConversation || isSending}
      />
    </div>
  );
}
