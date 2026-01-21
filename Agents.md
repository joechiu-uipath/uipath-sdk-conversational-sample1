
Please create a React-based chat application using 

# App design
- use this npm package and version in package.json to gain access to the "UiPath Typescript SDK" that contains all necessary functionality to communicate with a conversational agent hosted on the UiPath Platform backend "@uipath/uipath-typescript": "npm:@uipath/uipath-typescript-dev@^1.0.0-beta.1"
- In .env file, I have defined all the necessary information for OAuth and connecting to the UiPath Platform. I want to use OAuth code authorization flow with PKCE to obtain the token to use with UiPath platform. Pass in app base URL as redirect URL as our app would handle returned token.
- Use vite as build tool, wthe .env file contains a set of VITE_ prefixed variables that would be injected into the app in runtime
- Due to the OAuth configuration, the dev server needs to serve the test site at port 5173
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
  redirectUri: window.location.origin + window.location.pathname,
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

Sample response Agents API response

```
[
    {
        "id": 552774,
        "name": "Apple Genius Agent",
        "description": "This agent has information about Apple Inc and its founder Steve Jobs.",
        "processVersion": "1.0.0",
        "processKey": "CAS.Test.Suite.agent.Apple.Genius.Agent",
        "folderId": 2097047,
        "feedId": "66001d92-ad5c-47e3-a60a-430eb50c2122",
        "createdAt": "2025-08-14T19:38:50.923Z"
    },
    {
        "id": 552775,
        "name": "Friend Agent",
        "description": "",
        "processVersion": "1.0.0",
        "processKey": "CAS.Test.Suite.agent.Friend.Agent",
        "folderId": 2097047,
        "feedId": "66001d92-ad5c-47e3-a60a-430eb50c2122",
        "createdAt": "2025-08-14T19:38:50.937Z"
    }
]
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

Sample Conversations API response

```
{
    "items": [
        {
            "conversationId": "5cc9bf65-a1a9-40e3-8ae4-0c7742cef574",
            "createdAt": "2026-01-16T20:59:27.820Z",
            "updatedAt": "2026-01-16T21:19:43.773Z",
            "lastActivityAt": "2026-01-16T21:19:41.350Z",
            "label": "Calculating 30-Year Fixed Mortgage Formula",
            "autogenerateLabel": true,
            "userId": "7BAC08D0-DB97-4EA0-9FAB-7974733DB96A",
            "orgId": "9568BEBA-50A8-49D1-801E-F2D1711089FD",
            "tenantId": "86011AFE-5252-4E44-8805-B3430072D040",
            "folderId": 2097047,
            "agentReleaseId": 552775,
            "traceId": "fffed4e7-f9d6-474c-88c5-52709449a412",
            "spanId": "46f6f4f6-d438-4d09-82bb-3e7e0a1ac00e",
            "jobKey": "42D8D157-D236-4434-841B-396776F87993",
            "isLocalJobExecution": false
        },
        {
            "conversationId": "0454eab3-827f-4d4d-a2dc-6f2dc721caf1",
            "createdAt": "2026-01-16T20:57:57.907Z",
            "updatedAt": "2026-01-16T20:59:00.223Z",
            "lastActivityAt": "2026-01-16T20:58:58.913Z",
            "label": "Spider-Man Introduction with Markdown Format",
            "autogenerateLabel": true,
            "userId": "7BAC08D0-DB97-4EA0-9FAB-7974733DB96A",
            "orgId": "9568BEBA-50A8-49D1-801E-F2D1711089FD",
            "tenantId": "86011AFE-5252-4E44-8805-B3430072D040",
            "folderId": 2097047,
            "agentReleaseId": 552775,
            "traceId": "75fc3b36-9e48-4086-8364-587c778142cc",
            "spanId": "40b18d8b-32d0-430c-ab60-6270a5a2a97f",
            "jobKey": "00280173-65B1-4AC8-B275-E1A14916DE2B",
            "isLocalJobExecution": false
        },
        {
            "conversationId": "763fd3e0-dadf-4915-8bdb-a07f033426e0",
            "createdAt": "2026-01-16T20:57:57.000Z",
            "updatedAt": "2026-01-16T20:57:58.130Z",
            "lastActivityAt": "2026-01-16T20:57:57.007Z",
            "label": "New Conversation",
            "autogenerateLabel": true,
            "userId": "7BAC08D0-DB97-4EA0-9FAB-7974733DB96A",
            "orgId": "9568BEBA-50A8-49D1-801E-F2D1711089FD",
            "tenantId": "86011AFE-5252-4E44-8805-B3430072D040",
            "folderId": 2097047,
            "agentReleaseId": 552775,
            "traceId": "a0efc524-eff0-4a5d-a4af-461905017ab1",
            "spanId": "6b40bc5e-00df-4c18-be4f-0789a1935d68",
            "jobKey": "16A89276-BFA3-48D4-9ADB-F3BD11BB27C6",
            "isLocalJobExecution": false
        }
    ]
}

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

Maximum exchange limit is 20, do not use a higher value.

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

Sample Exchange API response

```
{
    "items": [
        {
            "exchangeId": "EC7F6EFA-121A-4953-B263-9171770C66EB",
            "spanId": "daf72a0a-b89f-4613-b98c-c2ce1bedc465",
            "createdAt": "2026-01-16T20:58:47.498Z",
            "updatedAt": "2026-01-16T20:58:47.707Z",
            "messages": [
                {
                    "messageId": "BEFCD5C4-B150-4A94-BC97-A020B203FDE3",
                    "role": "user",
                    "toolCalls": [],
                    "interrupts": [],
                    "spanId": "5e555377-5dcf-4e9f-90aa-daa82c31bfc2",
                    "createdAt": "2026-01-16T20:58:47.513Z",
                    "updatedAt": "2026-01-16T20:58:47.513Z",
                    "contentParts": [
                        {
                            "contentPartId": "5CE0DF01-2455-49BB-AAA1-5AEEAF82693D",
                            "mimeType": "text/markdown",
                            "data": {
                                "inline": "use Mardown as much as possible to make a well formatted, short introduction of Spiderman, include a markdown table."
                            },
                            "citations": [],
                            "createdAt": "2026-01-16T20:58:47.561Z",
                            "updatedAt": "2026-01-16T20:58:47.561Z"
                        }
                    ]
                },
                {
                    "messageId": "d1800910-6cfd-436a-8b89-b13e15ebce98",
                    "role": "assistant",
                    "toolCalls": [],
                    "interrupts": [],
                    "spanId": "154af6a5-c3ca-48c3-81f8-e6852ab4b52c",
                    "createdAt": "2026-01-16T20:58:51.500Z",
                    "updatedAt": "2026-01-16T20:58:51.500Z",
                    "contentParts": [
                        {
                            "contentPartId": "3f801d13-1175-4f61-9c36-cca735efe1bb",
                            "mimeType": "text/markdown",
                            "data": {
                                "inline": "Certainly! I'd be happy to create a well-formatted, short introduction of Spider-Man using Markdown, including a table. Here's what I've put together for you:\n\n# Spider-Man: Your Friendly Neighborhood Superhero\n\n## Introduction\n\nSpider-Man, created by Stan Lee and Steve Ditko, is one of Marvel Comics' most beloved superheroes. First appearing in 1962, Peter Parker's alter ego has become a cultural icon, inspiring numerous comics, movies, TV shows, and video games.\n\n## Key Information\n\n| Aspect | Details |\n|--------|---------|\n| Real Name | Peter Benjamin Parker |\n| Created by | Stan Lee and Steve Ditko |\n| First Appearance | Amazing Fantasy #15 (August 1962) |\n| Powers | Superhuman strength, speed, agility; wall-crawling; \"spider-sense\" |\n| Occupation | Photographer, scientist, student |\n| Affiliations | Avengers, Fantastic Four (occasional) |\n\n## Notable Characteristics\n\n- **Origin**: Bitten by a radioactive spider, gaining superhuman abilities\n- **Motto**: \"With great power comes great responsibility\"\n- **Costume**: Iconic red and blue suit with web patterns\n- **Equipment**: Web-shooters for swinging and combat\n\nSpider-Man's relatable struggles as Peter Parker, combined with his witty humor and unwavering sense of responsibility, have made him one of the most enduring and popular superheroes of all time."
                            },
                            "citations": [],
                            "isTranscript": false,
                            "createdAt": "2026-01-16T20:58:58.625Z",
                            "updatedAt": "2026-01-16T20:58:58.625Z"
                        }
                    ]
                }
            ]
        }
    ]
}
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
| Redirect URI mismatch | Ensure app base URL matches the URL registered in External Applications
| Scope errors | Verify the required scopes are granted to your External Application
| WebSocket connection failed | Check network connectivity and ensure ConversationalAgents scope is granted

### rev logs
 - should provide agent object JSON, id property and is numeric