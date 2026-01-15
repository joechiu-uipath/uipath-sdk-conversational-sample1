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
          value={selectedConversation?.conversationId || ''}
          onChange={(e) => {
            const conversation = conversations.find(
              (c) => c.conversationId === e.target.value
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
          {conversations.map((conv) => (
            <option key={conv.conversationId} value={conv.conversationId}>
              {conv.label || conv.conversationId}
            </option>
          ))}
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
