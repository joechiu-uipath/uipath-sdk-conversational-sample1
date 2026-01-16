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
            // Separate text content parts from attachment content parts
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

  const handleSendMessage = async (messageText, attachments = []) => {
    if (!sessionHelperRef.current || isSending) return;

    setIsSending(true);

    const userMessageId = `temp-user-${Date.now()}`;

    const userMessage = {
      id: userMessageId,
      role: MESSAGE_ROLE.USER,
      content: messageText,
      toolCalls: [],
      citations: [],
      attachments: attachments.map((a) => ({ name: a.name, mimeType: a.mimeType })),
    };

    // Add a placeholder for the first assistant message
    const placeholderMessageId = `temp-assistant-${Date.now()}`;
    const placeholderMessage = {
      id: placeholderMessageId,
      role: MESSAGE_ROLE.ASSISTANT,
      content: '',
      toolCalls: [],
      citations: [],
      isLoading: true,
    };

    setMessages((prev) => [...prev, userMessage, placeholderMessage]);

    // Track message state per message ID
    const messageStateMap = {};

    const getOrCreateMessageState = (messageId) => {
      if (!messageStateMap[messageId]) {
        messageStateMap[messageId] = {
          content: '',
          toolCalls: [],
        };
      }
      return messageStateMap[messageId];
    };

    const updateMessage = (messageId, updates) => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === messageId
            ? { ...msg, ...updates }
            : msg
        )
      );
    };

    const addOrUpdateMessage = (messageId, role, updates) => {
      setMessages((prev) => {
        const existingIndex = prev.findIndex((msg) => msg.id === messageId);
        if (existingIndex >= 0) {
          // Update existing message
          return prev.map((msg) =>
            msg.id === messageId
              ? { ...msg, ...updates }
              : msg
          );
        } else {
          // Remove placeholder and add new message
          const withoutPlaceholder = prev.filter((msg) => msg.id !== placeholderMessageId);
          return [
            ...withoutPlaceholder,
            {
              id: messageId,
              role,
              content: '',
              toolCalls: [],
              citations: [],
              ...updates,
            },
          ];
        }
      });
    };

    try {
      const exchange = sessionHelperRef.current.startExchange();

      exchange.onMessageStart((message) => {
        const messageId = message.startEvent.messageId || `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const role = message.startEvent.role;

        if (role === MESSAGE_ROLE.ASSISTANT) {
          const state = getOrCreateMessageState(messageId);

          // Create the message entry (replaces placeholder on first message)
          addOrUpdateMessage(messageId, role, { isLoading: true });

          message.onContentPartStart((contentPart) => {
            contentPart.onChunk((chunk) => {
              state.content += chunk.data || '';
              addOrUpdateMessage(messageId, role, {
                content: state.content,
                toolCalls: state.toolCalls,
                isLoading: false,
              });
            });
          });

          message.onToolCallStart((toolCall) => {
            const { toolCallId, toolName, input } = toolCall.startEvent;
            const newToolCall = {
              id: toolCallId,
              toolCallId,
              name: toolName,
              input: input || {},
              status: 'running',
              output: null,
              isError: false,
            };
            state.toolCalls = [...state.toolCalls, newToolCall];
            addOrUpdateMessage(messageId, role, {
              content: state.content,
              toolCalls: [...state.toolCalls],
              isLoading: false,
            });

            toolCall.onToolCallEnd((endEvent) => {
              const { isError, output } = endEvent;
              state.toolCalls = state.toolCalls.map((tc) =>
                tc.toolCallId === toolCallId
                  ? { ...tc, status: isError ? 'error' : 'completed', output, isError }
                  : tc
              );
              addOrUpdateMessage(messageId, role, {
                content: state.content,
                toolCalls: [...state.toolCalls],
              });
            });
          });

          message.onMessageEnd?.(() => {
            addOrUpdateMessage(messageId, role, {
              content: state.content,
              toolCalls: state.toolCalls,
              isLoading: false,
            });
          });
        }
      });

      exchange.onExchangeEnd(() => {
        // Remove placeholder if it still exists (no messages were received)
        setMessages((prev) => prev.filter((msg) => msg.id !== placeholderMessageId));
        setIsSending(false);
      });

      // If there are attachments, upload them first and send with attachment content parts
      if (attachments.length > 0) {
        try {
          // Upload all attachments
          const uploadedAttachments = await Promise.all(
            attachments.map((attachment) =>
              conversationalAgentService.conversations.attachments.upload(
                selectedConversation.conversationId,
                attachment.file
              )
            )
          );

          // Start a message with multiple content parts
          const message = exchange.startMessage({ role: 'user' });

          // Send text content part if there's text
          if (messageText) {
            await message.sendContentPart({
              data: messageText,
              mimeType: 'text/markdown',
            });
          }

          // Send attachment content parts
          for (const uploaded of uploadedAttachments) {
            message.startContentPart(
              {
                mimeType: uploaded.mimeType,
                name: uploaded.name,
                externalValue: { uri: uploaded.uri },
              },
              async () => {}
            );
          }

          // End the message
          message.sendMessageEnd();
        } catch (uploadError) {
          console.error('Failed to upload attachments:', uploadError);
          // Update user message to show upload failed
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === userMessageId
                ? { ...msg, uploadError: 'Failed to upload attachments. This may be a CORS issue.' }
                : msg
            )
          );
          // Remove placeholder and reset sending state
          setMessages((prev) => prev.filter((msg) => msg.id !== placeholderMessageId));
          setIsSending(false);
          return;
        }
      } else {
        // No attachments, send simple message
        exchange.sendMessageWithContentPart({
          data: messageText,
        });
      }
    } catch (error) {
      console.error('Failed to send message:', error);
      setIsSending(false);
      setMessages((prev) => prev.filter((msg) => msg.id === userMessageId || !msg.id.startsWith('temp-')));
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
