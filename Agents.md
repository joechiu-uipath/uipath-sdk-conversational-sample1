
Please create a React-based chat application using 

# App design
- use this npm package and version in package.json to gain access to the "UiPath Typescript SDK" that contains all necessary functionality to communicate with a conversational agent hosted on the UiPath Platform backend "@uipath/uipath-typescript": "npm:@uipath/uipath-typescript-dev@^1.0.0-beta.1"
- In .env file, I have defined all the necessary information for OAuth and connecting to the UiPath Platform. I want to use OAuth code authorization flow with PKCE to obtain the token to use with UiPath platform.
- the App is a React chat application built in using javascript
- The app should provide an initial sign in screen that user can use to perform OAuth sign in flow.
- Once signed in, the chat application has a few key UI area
  - on top, there is the top bar. This should have app title "Pro Dev SDK - Conversational Agents Test App"
  - also in top bar, a drop down contain a list of all conversational agents in this tenant
  - in top bar, next to the agents drop down, contains a list of conversations for the selected agent. When selected agent changes, make sure to refresh the converations drop down as well.
  - also in top bar, next to conversation picker, right aligned, is a "New Chat" button to create new conversation for the selected agent
  - When doing a "New Chat", make sure 
  - Blow the top bar, is the main Content area, this is where a list of messages from both agent and users are displayed. The messages should be ordered old on top. And if the scrollbar is at the bottom and new message came in, we should auto-scroll to the bottom of the chat. But if the user has manually scrolled to a different place in the chat, we should not auto scroll.
  - the content is often in markdown format, be sure to render markdown and not just show raw text
  - there are tool calls and citations asscoaited with a message, be sure to render them in a visually distinct way to inform users
  - At the bottom, there should be a message input area and a Send button to the right  
- Extract all the constants to a constant file, do not have magic number in the code

# Conversational SDK Concepts

## Conversational Agent SDK Usage

The Samples App Conversational Agent UI utilizes the SDK through the following structure:

### SDK Initialization

The samples app uses the AuthProvider and useAuth hook to manage SDK initialization and authentication:

```
// App.tsx - SDK Configuration
import { UiPath } from '@uipath/uipath-typescript/core';
import type { UiPathSDKConfig } from '@uipath/uipath-typescript/core';
import { ConversationalAgent } from '@uipath/uipath-typescript/conversational-agent';

// Configuration from environment variables
const authConfig: UiPathSDKConfig = {
  clientId: import.meta.env.VITE_UIPATH_CLIENT_ID,
  orgName: import.meta.env.VITE_UIPATH_ORG_NAME,
  tenantName: import.meta.env.VITE_UIPATH_TENANT_NAME,
  baseUrl: import.meta.env.VITE_UIPATH_BASE_URL,
  redirectUri: import.meta.env.VITE_UIPATH_REDIRECT_URI,
  scope: import.meta.env.VITE_UIPATH_SCOPE,
};

// Create SDK instance
const sdk = new UiPath(authConfig);

// Handle OAuth callback if returning from login
if (sdk.isInOAuthCallback()) {
  await sdk.completeOAuth();
}

// Check if already authenticated
if (!sdk.isAuthenticated()) {
  // Trigger OAuth login flow
  await sdk.initialize();
}

// Create Conversational Agent service instance
const conversationalAgentService = new ConversationalAgent(sdk);
```

### Service Structure

The ConversationalAgent service provides access to the following sub-services:

| Service | Access Path | Description | 
| - | - | - |
| Agents | conversationalAgentService.agents | List and retrieve agent details
| Conversations | conversationalAgentService.conversations |Create, list, update, delete conversations
| Exchanges | conversationalAgentService.conversations.exchanges | Access conversation exchanges (message pairs)
| Messages | conversationalAgentService.conversations.messages | Access message content and parts
| Attachments | conversationalAgentService.conversations.attachments | Upload and manage file attachments
| User | conversationalAgentService.user | Manage user settings
| Traces | conversationalAgentService.traces | Access LLM operation traces |
| Events | conversationalAgentService.events | WebSocket event streaming |

### Agents API

```
// Get all available agents
const agents = await conversationalAgentService.agents.getAll();

// Get agents for a specific folder
const folderAgents = await conversationalAgentService.agents.getAll(folderId);

// Get agent details with appearance configuration
const agentDetails = await conversationalAgentService.agents.getById(folderId, agentId);
```

### Conversations API

```
// Create a new conversation
const conversation = await conversationalAgentService.conversations.create({
  agentReleaseId: selectedAgent.id,
  folderId: selectedAgent.folderId,
  label: 'My Conversation',
  autogenerateLabel: true
});

// List all conversations
const conversations = await conversationalAgentService.conversations.getAll({
  sort: 'descending',
  limit: 20
});

// Get a specific conversation
const conversation = await conversationalAgentService.conversations.getById(conversationId);

// Update conversation
const updated = await conversationalAgentService.conversations.update(conversationId, {
  label: 'New Label'
});

// Delete conversation
await conversationalAgentService.conversations.remove(conversationId);
```

### Real-Time Chat with WebSocket Events

The SDK uses WebSocket for real-time message streaming:

```
// Start a session for a conversation
const sessionHelper = conversationalAgentService.events.startSession({
  conversationId: conversation.conversationId
});

// Handle session events
sessionHelper.onSessionStarted(() => {
  console.log('Session started');
});

sessionHelper.onErrorStart((error) => {
  console.error('Session error:', error);
});

// Create an exchange (message pair: user + assistant)
const exchange = sessionHelper.startExchange();

// Handle exchange events for streaming response
exchange.onMessageStart((message) => {
  if (message.startEvent.role === 'assistant') {
    message.onContentPartStart((contentPart) => {
      // Stream chunks in real-time
      contentPart.onChunk((chunk) => {
        process.stdout.write(chunk.data || '');
      });

      contentPart.onContentPartEnd(() => {
        console.log('Content part complete');
      });
    });
  }
});

exchange.onExchangeEnd(() => {
  console.log('Exchange complete');
});

// Send user message
exchange.sendMessageWithContentPart({
  data: 'Hello, how can you help me?'
});
```
### Sending Messages with Attachments

```
// Upload an attachment
const attachment = await conversationalAgentService.conversations.attachments.upload(
  conversationId,
  file  // File object
);

// Send message with attachment reference
const message = exchange.startMessage({ role: 'user' });

// Send text content
await message.sendContentPart({
  data: 'Please analyze this document',
  mimeType: 'text/markdown'
});

// Reference the uploaded attachment
message.startContentPart({
  mimeType: attachment.mimeType,
  name: attachment.name,
  externalValue: { uri: attachment.uri }
}, async () => {});

message.sendMessageEnd();
```

### Exchanges API (Chat History)

```
// Get all exchanges in a conversation
const exchanges = await conversationalAgentService.conversations.exchanges.getAll(
  conversationId,
  { exchangeSort: 'descending', messageSort: 'ascending', limit: 10 }
);

// Get a specific exchange
const exchange = await conversationalAgentService.conversations.exchanges.getById(
  conversationId,
  exchangeId,
  { messageSort: 'ascending' }
);

// Submit feedback on an exchange
await conversationalAgentService.conversations.exchanges.createFeedback(
  conversationId,
  exchangeId,
  { rating: 'positive', comment: 'Great response!' }
);
```
### User Settings API

```
// Get current user settings
const settings = await conversationalAgentService.user.getSettings();

// Update user settings
const updated = await conversationalAgentService.user.updateSettings({
  name: 'John Doe',
  email: 'john@example.com',
  timezone: 'America/New_York'
});
```

### Feature Flags

```
// Get tenant-specific feature flags
const featureFlags = await conversationalAgentService.getFeatureFlags();
```

### Traces API (Observability)

```
// Get trace spans for LLM operations
const spans = await conversationalAgentService.traces.getSpans(traceId);
```

### Connection Management

```
// Monitor connection status
conversationalAgentService.onConnectionStatusChanged((status) => {
  console.log('Connection status:', status);
});

// Check connection state
const isConnected = conversationalAgentService.isConnected;
const status = conversationalAgentService.connectionStatus;
const error = conversationalAgentService.connectionError;

// Cleanup
conversationalAgentService.disconnect();
```

### Troubleshooting

| Issue | Solution |
| - | -
| 401 Unauthorized during npm install | Verify your GitHub PAT token is valid and has read:packages scope
| Package not found | Ensure .npmrc is in the correct directory (samples/process-app)
| Token expired | Generate a new PAT token and update .npmrc
| Authentication errors in app | Verify your .env file has correct UiPath credentials
| Redirect URI mismatch | Ensure VITE_UIPATH_REDIRECT_URI matches the URL registered in External Applications
| Scope errors | Verify the required scopes are granted to your External Application
| WebSocket connection failed | Check network connectivity and ensure ConversationalAgents scope is granted

### rev logs
 - should provide agent object JSON, id property and is numeric