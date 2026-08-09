# Cue - Real-Time AI Conversation Copilot

Cue is an Android application that provides real-time AI-powered suggestions during conversations. It listens to incoming speech, converts it to text, understands context, and displays concise suggested responses—without automatically speaking or sending anything.

## Features

- **Live Speech Recognition**: Converts incoming audio to text in real-time
- **AI-Powered Suggestions**: Generates three concise response options based on conversation context
- **Coaching Messages**: Provides contextual guidance to help achieve conversation goals
- **Conversation Goals**: Preset and custom goals to guide the AI's suggestions
- **Demo Mode**: Fully functional offline demonstration with simulated conversations
- **Session Memory**: Maintains conversation history and important facts
- **Session Persistence**: Stores previous conversations locally
- **Privacy-First**: Clear privacy controls and user-controlled data

## Architecture

```
┌──────────────────────────┐
│  Android UI              │ (Compose)
└────────┬─────────────────┘
         │
┌────────▼──────────────────┐
│   CueViewModel            │ (StateFlow, ViewModel)
└────────┬──────────────────┘
         │
┌────────▼────────────────────────────────────────────┐
│  ConversationEngine                                  │
├──────────────┬──────────────┬──────────────┬────────┤
│              │              │              │        │
▼              ▼              ▼              ▼        ▼
SpeechToText  AIResponse  AudioInput  Session    Error
Service       Service      Source      Repo     Handling
```

### Core Components

- **SpeechToTextService**: Abstraction for speech recognition
  - `AndroidSpeechToTextService`: Uses Android's native recognition
  - `DemoSpeechToTextService`: Simulates speech for demo mode

- **AIResponseService**: Abstraction for AI providers
  - `MockAIResponseService`: Local AI engine (no API key required)
  - `RemoteAIResponseService`: External AI provider (configurable)

- **ConversationEngine**: Orchestrates conversation flow
  - Manages conversation state
  - Coordinates services
  - Handles real-time updates

- **ConversationAudioSource**: Abstract audio input
  - `MicrophoneAudioSource`: Device microphone
  - `DemoConversationAudioSource`: Simulated audio for demo mode

- **CueViewModel**: Exposes reactive UI state via StateFlow

- **SessionRepository**: Persists conversation history (Room)

## Tech Stack

- **Language**: Kotlin
- **UI**: Jetpack Compose with Material 3
- **Architecture**: MVVM with Repository Pattern
- **State Management**: StateFlow, ViewModel
- **Coroutines**: Kotlin Coroutines
- **Persistence**: Room Database
- **Speech Recognition**: Android SpeechRecognizer
- **Build System**: Gradle Kotlin DSL

## How to Build

```bash
./gradlew build
```

## How to Run

1. Install on an Android device (API 24+)
2. Launch the app
3. Grant microphone permission when prompted
4. Choose "Demo Conversation" to test without setup
5. Choose "Start Cue" to begin a real conversation

## Demo Mode

Demo Mode requires no API key and works completely offline.

**To enter Demo Mode**: Launch the app and tap "Demo Conversation" on the home screen.

## AI Provider Configuration

### Mock AI (Default)

The app uses `MockAIResponseService` by default, which provides local suggestions without any external API.

No configuration needed—the app works out of the box.

### External AI Provider

To use an external provider:

1. Create a file at `app/src/main/assets/ai_config.properties`:
   ```properties
   ai_provider=remote
   ai_api_key=your-api-key-here
   ai_provider_type=openai
   ai_endpoint=https://api.openai.com/v1/chat/completions
   ```

2. Rebuild and run

**Note**: API keys are not committed to the repository.

## Required Permissions

- `RECORD_AUDIO` - To listen to the device microphone
- `INTERNET` - Only if using an external AI provider

## Platform Limitations

### Cellular Call Audio Capture

**Important**: Android does **not** provide unrestricted access to cellular call audio. The MVP uses device microphone input for general conversations.

## Privacy & Data

- **No Covert Recording**: The app does not secretly record conversations
- **User Control**: All recording starts explicitly via the UI
- **Local Processing**: Demo mode processes audio entirely on-device

## Project Structure

```
app/
├── src/main/
│   ├── java/com/example/cue/
│   │   ├── ui/                  # Compose screens
│   │   ├── viewmodel/           # ViewModels
│   │   ├── engine/              # Conversation engine
│   │   ├── service/             # Services (speech, AI)
│   │   ├── repository/          # Data repositories
│   │   ├── data/                # Database entities
│   │   ├── di/                  # Dependency injection
│   │   └── util/                # Utilities
│   └── res/                     # Resources
├── src/test/                    # Unit tests
└── src/androidTest/             # UI tests
```

## Testing

```bash
./gradlew test
./gradlew connectedAndroidTest
```

---

**Version**: 1.0 MVP  
**Status**: Production Ready for Demo Mode
