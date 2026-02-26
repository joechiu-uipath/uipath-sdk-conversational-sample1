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

// ─── State update helpers (match reference sample exactly) ───

function updateMessage(setMessages, id, updates) {
  setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...updates } : m)));
}

function updateMessageWith(setMessages, id, updater) {
  setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...updater(m) } : m)));
}

// ─── Assistant message handler setup (match reference sample exactly) ───
// Called once per assistant message. Each call gets its own fresh contentState.
// Multiple calls for the same exchange all target the same assistantMessageId.

function setupAssistantHandlers(message, assistantMessageId, setMessages) {
  const contentState = { fullContent: '' };

  // Tool calls — append to existing array from React state
  message.onToolCallStart((toolCall) => {
    const info = {
      id: toolCall.toolCallId,
      toolCallId: toolCall.toolCallId,
      name: toolCall.startEvent.toolName,
      input: toolCall.startEvent.input || {},
      status: 'running',
      output: null,
      isError: false,
    };
    updateMessageWith(setMessages, assistantMessageId, (m) => ({
      toolCalls: [...(m.toolCalls || []), info],
      isLoading: false,
    }));

    toolCall.onToolCallEnd(({ isError, output }) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMessageId
            ? {
                ...m,
                toolCalls: (m.toolCalls || []).map((tc) =>
                  tc.toolCallId === toolCall.toolCallId
                    ? { ...tc, status: isError ? 'error' : 'completed', output, isError }
                    : tc
                ),
              }
            : m
        )
      );
    });
  });

  // Content parts — stream text chunks, finalize with citations on completed
  // Match reference: check part.isText, part.isMarkdown, and mimeType for text/html
  message.onContentPartStart((part) => {
    const mimeType = part.startEvent?.mimeType;
    const isTextContent = mimeType === 'text/html' || part.isText || part.isMarkdown
      || (mimeType && mimeType.startsWith('text/'));
    if (!isTextContent) return;

    part.onChunk(({ data, citation }) => {
      contentState.fullContent += data || '';
      updateMessage(setMessages, assistantMessageId, {
        content: contentState.fullContent,
        isLoading: false,
      });
    });

    if (part.onCompleted) {
      part.onCompleted((completed) => {
        const citations = (completed.citations || []).map((c) => ({
          citationId: c.citationId,
          offset: c.offset,
          length: c.length,
          sources: c.sources,
        }));
        updateMessageWith(setMessages, assistantMessageId, (m) => ({
          content: contentState.fullContent,
          isLoading: false,
          citations: citations.length > 0 ? citations : m.citations,
        }));
      });
    }
  });

  // NOTE: No onMessageEnd handler — matches the reference sample exactly.
  // Content is finalized by onCompleted. isLoading is managed by onChunk/onCompleted.
}

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

  // Session and conversation refs — independent of React render cycle
  const sessionRef = useRef(null);
  const sessionPromiseRef = useRef(null);
  const currentConversationIdRef = useRef(null);
  // Stores the conversation OBJECT (from getById) for bound methods like startSession/endSession
  const conversationObjRef = useRef(null);

  // Maps exchangeId -> assistantMessageId (pre-registered before startExchange)
  const exchangeAssistantIdRef = useRef(new Map());

  // ─── Data loading ───

  const loadAgents = useCallback(async () => {
    if (!conversationalAgentService) return;

    setIsLoadingAgents(true);
    try {
      const agentsList = await conversationalAgentService.getAll();
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
        pageSize: CONVERSATION_FETCH_LIMIT,
      });
      const allConversations = Array.isArray(response) ? response : (response?.items || response?.data || []);

      // Filter conversations by selected agent
      const filteredConversations = allConversations.filter(conv => {
        const convAgentId = conv.agentId || conv.agentReleaseId || conv.agent?.id;
        return convAgentId === selectedAgent.id;
      });

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
      const conversationId = selectedConversation.id || selectedConversation.conversationId;
      const conversation = await conversationalAgentService.conversations.getById(conversationId);
      const response = await conversation.exchanges.getAll({
        exchangeSort: 'ascending',
        messageSort: 'ascending',
        pageSize: 20,
      });

      const exchanges = Array.isArray(response) ? response : (response?.items || response?.data || []);
      const messageList = [];
      for (const exchange of exchanges) {
        if (exchange.messages) {
          for (const msg of exchange.messages) {
            const textMimeTypes = ['text/plain', 'text/markdown', 'text/html'];
            const textParts = msg.contentParts?.filter(
              (part) => textMimeTypes.includes(part.mimeType) || part.data?.inline
            ) || [];
            const attachmentParts = msg.contentParts?.filter(
              (part) => !textMimeTypes.includes(part.mimeType) && !part.data?.inline && part.mimeType
            ) || [];

            const content = textParts
              .map((part) => part.data?.inline || '')
              .join('') || '';
            const citations = msg.contentParts
              ?.flatMap((part) => part.citations || []) || [];
            const attachments = attachmentParts.map((part) => ({
              name: part.name || 'Attachment',
              mimeType: part.mimeType,
              uri: part.data?.uri,
            }));

            messageList.push({
              id: msg.messageId,
              role: msg.role,
              content,
              toolCalls: msg.toolCalls || [],
              citations,
              attachments,
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

  // ─── Session management ───

  const endCurrentSession = useCallback(() => {
    if (sessionRef.current && conversationObjRef.current) {
      try {
        conversationObjRef.current.endSession();
      } catch (e) {
        console.error('Error ending session:', e);
      }
    }
    sessionRef.current = null;
    sessionPromiseRef.current = null;
    currentConversationIdRef.current = null;
    conversationObjRef.current = null;
    exchangeAssistantIdRef.current.clear();
  }, []);

  const ensureSession = useCallback(async () => {
    // If session already exists and is ready, return it
    if (sessionRef.current) return sessionRef.current;

    // If session creation is in progress, wait for it
    if (sessionPromiseRef.current) return sessionPromiseRef.current;

    const conversationId = currentConversationIdRef.current;
    if (!conversationalAgentService || !conversationId) {
      throw new Error('Cannot create session: missing service or conversation');
    }

    sessionPromiseRef.current = (async () => {
      // Match reference: get conversation object, then call bound startSession
      const conversation = await conversationalAgentService.conversations.getById(conversationId);
      conversationObjRef.current = conversation;
      const session = conversation.startSession({ echo: true });

      // Register exchange handler ONCE — handles ALL exchanges via echo
      // Matches reference: setupExchangeHandlers()
      session.onExchangeStart((exchange) => {
        const assistantId = exchangeAssistantIdRef.current.get(exchange.exchangeId);
        if (!assistantId) return;

        exchange.onMessageStart((message) => {
          if (!message.isAssistant) return;
          setupAssistantHandlers(message, assistantId, setMessages);
        });

        exchange.onExchangeEnd(() => {
          exchangeAssistantIdRef.current.delete(exchange.exchangeId);
          setIsSending(false);
        });

        exchange.onErrorStart((err) => {
          console.error('Exchange error:', err);
          exchangeAssistantIdRef.current.delete(exchange.exchangeId);
          setIsSending(false);
        });
      });

      session.onSessionEnding(() => {
        console.log('Session ending requested by server');
      });

      session.onLabelUpdated(({ label }) => {
        if (label) {
          setConversations((prev) =>
            prev.map((conv) => {
              const convId = conv.id || conv.conversationId;
              return convId === conversationId ? { ...conv, label } : conv;
            })
          );
        }
      });

      // Wait for session to be ready — onErrorStart rejects if session fails
      await new Promise((resolve, reject) => {
        session.onSessionStarted(() => {
          console.log('Session started for conversation:', conversationId);
          resolve();
        });

        session.onSessionEnd?.(() => {
          sessionRef.current = null;
          sessionPromiseRef.current = null;
        });

        session.onErrorStart((error) => {
          console.error('Session error:', error);
          if (!sessionRef.current) {
            reject(new Error(error.message || 'Session failed to start'));
          }
        });
      });

      sessionRef.current = session;
      return session;
    })();

    try {
      return await sessionPromiseRef.current;
    } catch (error) {
      sessionPromiseRef.current = null;
      throw error;
    }
  }, [conversationalAgentService]);

  // ─── Effects ───

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

  // Message loading only — session creation is lazy (in handleSendMessage)
  useEffect(() => {
    if (!selectedConversation) return;
    loadMessages();
  }, [selectedConversation, loadMessages]);

  // Cleanup session on unmount
  useEffect(() => {
    return () => {
      endCurrentSession();
    };
  }, [endCurrentSession]);

  // ─── Event handlers ───

  const handleAgentChange = (agent) => {
    setSelectedAgent(agent);
  };

  const handleConversationChange = (conversation) => {
    endCurrentSession();
    const conversationId = conversation?.id || conversation?.conversationId || null;
    currentConversationIdRef.current = conversationId;
    setSelectedConversation(conversation);
  };

  const handleNewChat = async () => {
    if (!conversationalAgentService || !selectedAgent) return;

    try {
      endCurrentSession();
      const newConversation = await conversationalAgentService.conversations.create(
        selectedAgent.id,
        selectedAgent.folderId,
        {
          label: DEFAULT_CONVERSATION_LABEL,
          autogenerateLabel: true,
        }
      );

      await loadConversations();
      const conversationId = newConversation.id || newConversation.conversationId;
      currentConversationIdRef.current = conversationId;
      setSelectedConversation(newConversation);
    } catch (error) {
      console.error('Failed to create conversation:', error);
    }
  };

  const handleSendMessage = async (messageText, attachments = []) => {
    if (!currentConversationIdRef.current || isSending) return;

    setIsSending(true);

    const userMessageId = `user-${Date.now()}`;
    const userMessage = {
      id: userMessageId,
      role: MESSAGE_ROLE.USER,
      content: messageText,
      toolCalls: [],
      citations: [],
      attachments: attachments.map((a) => ({ name: a.name, mimeType: a.mimeType })),
    };

    const assistantId = `assistant-${Date.now()}`;
    const placeholderMessage = {
      id: assistantId,
      role: MESSAGE_ROLE.ASSISTANT,
      content: '',
      toolCalls: [],
      citations: [],
      isLoading: true,
    };

    setMessages((prev) => [...prev, userMessage, placeholderMessage]);

    // Pre-register the exchange-to-assistant mapping BEFORE starting the exchange
    const exchangeId = `exchange-${Date.now()}-${Math.random().toString(36).substr(2, 12)}`;
    exchangeAssistantIdRef.current.set(exchangeId, assistantId);

    try {
      // Lazy session creation — creates on first send, reuses thereafter
      const session = await ensureSession();

      const exchange = session.startExchange({ exchangeId });

      // NOTE: Do NOT register handlers on exchange here.
      // All handlers are set up in session.onExchangeStart() (in ensureSession).
      // echo:true ensures onExchangeStart fires for this client-initiated exchange.

      if (attachments.length > 0) {
        try {
          const uploadedAttachments = await Promise.all(
            attachments.map((attachment) =>
              conversationObjRef.current.uploadAttachment(attachment.file)
            )
          );

          const message = exchange.startMessage({ role: 'user' });

          if (messageText) {
            await message.sendContentPart({ data: messageText });
          }

          for (const uploaded of uploadedAttachments) {
            message.startContentPart({
              mimeType: uploaded.mimeType,
              name: uploaded.name,
              externalValue: { uri: uploaded.uri },
            }).sendContentPartEnd();
          }

          message.sendMessageEnd();
        } catch (uploadError) {
          console.error('Failed to upload attachments:', uploadError);
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === userMessageId
                ? { ...msg, uploadError: 'Failed to upload attachments.' }
                : msg
            )
          );
          setMessages((prev) => prev.filter((msg) => msg.id !== assistantId));
          setIsSending(false);
          exchangeAssistantIdRef.current.delete(exchangeId);
          return;
        }
      } else {
        // Match reference: explicit startMessage + sendContentPart + sendMessageEnd
        const message = exchange.startMessage({ role: 'user' });
        await message.sendContentPart({ data: messageText });
        message.sendMessageEnd();
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      setIsSending(false);
      exchangeAssistantIdRef.current.delete(exchangeId);
      setMessages((prev) => prev.filter((msg) =>
        msg.id === userMessageId || !msg.id.startsWith('assistant-')
      ));
    }
  };

  // ─── Render ───

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
