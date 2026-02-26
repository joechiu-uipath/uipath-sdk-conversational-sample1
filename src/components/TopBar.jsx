import { APP_TITLE } from '../constants';

export default function TopBar({
  agents,
  selectedAgent,
  onAgentChange,
  conversations,
  selectedConversation,
  onConversationChange,
  onNewChat,
  isLoadingAgents,
  isLoadingConversations,
}) {
  return (
    <div className="topbar">
      <h1 className="topbar-title">{APP_TITLE}</h1>
      <div className="topbar-controls">
        <select
          className="topbar-select"
          value={selectedAgent?.id ?? ''}
          onChange={(e) => {
            const agentId = Number(e.target.value);
            const agent = agents.find((a) => a.id === agentId);
            onAgentChange(agent || null);
          }}
          disabled={isLoadingAgents}
        >
          <option value="">
            {isLoadingAgents ? 'Loading agents...' : 'Select an agent'}
          </option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </select>

        <select
          className="topbar-select"
          value={selectedConversation?.id || selectedConversation?.conversationId || ''}
          onChange={(e) => {
            const conversation = conversations.find(
              (c) => (c.id || c.conversationId) === e.target.value
            );
            onConversationChange(conversation);
          }}
          disabled={!selectedAgent || isLoadingConversations}
        >
          <option value="">
            {isLoadingConversations
              ? 'Loading conversations...'
              : 'Select a conversation'}
          </option>
          {conversations.map((conv) => {
            const convId = conv.id || conv.conversationId;
            const displayLabel = conv.label && conv.label.trim()
              ? conv.label
              : `Chat ${convId.substring(0, 8)}...`;
            return (
              <option key={convId} value={convId}>
                {displayLabel}
              </option>
            );
          })}
        </select>

        <button
          className="topbar-button"
          onClick={onNewChat}
          disabled={!selectedAgent}
        >
          New Chat
        </button>
      </div>
    </div>
  );
}
