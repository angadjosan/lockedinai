# Locked In AI — Product Requirements Document

## Overview

Locked In AI is a desktop productivity monitor that captures your screen every 30 seconds, sends the screenshot to an AI model for analysis, and roasts you with a taunting popup if you're slacking off.

## Problem

People lose hours to distractions (Twitter, YouTube, Reddit, random browsing) without realizing it. Existing productivity tools track time passively — they don't actively call you out. There's no accountability loop that hits in real time.

## Solution

A lightweight macOS menu bar app that:

1. **Screenshots your screen** every 3 minutes
2. **Sends the screenshot to an AI vision model** (Claude or GPT-4o) to determine what you're doing
3. **Judges your productivity** based on context you provide (e.g., "I'm supposed to be coding")
4. **Roasts you via system notification** if you're not productive — savage, funny, personalized

## Target User

Developers, students, freelancers, and anyone who wants brutal accountability while working.

## Core Features

### v1.0 — MVP

| Feature | Description |
|---|---|
| **Screen Capture** | Take a screenshot every 3 minutes using macOS screen capture APIs. Requires screen recording permission. |
| **AI Analysis** | Send screenshot to a vision-capable LLM (Claude Sonnet/Opus or GPT-4o). Prompt asks: "What is this person doing? Are they being productive?" |
| **Productivity Context** | User sets a short description of what they should be working on (e.g., "building my startup", "studying for finals"). AI judges against this. |
| **Roast Notifications** | If AI determines user is unproductive, fire a macOS notification with a roast. Roasts should be funny, sharp, and varied — not generic. |
| **Menu Bar App** | Lives in the macOS menu bar. Start/stop monitoring. Set your current task. View roast history. |
| **Privacy-First** | Screenshots are sent to the AI API and immediately discarded. Nothing is stored on disk or uploaded elsewhere. |

### v1.1 — Enhancements

| Feature | Description |
|---|---|
| **Productivity Score** | Track a rolling productivity score throughout the day. Show it in the menu bar (e.g., "🔥 87%"). |
| **Roast Intensity Slider** | Let users pick how savage the roasts are: Gentle, Medium, Brutal, Unhinged. |
| **Focus Streaks** | Track consecutive productive checks. Celebrate streaks ("45 minutes locked in — you're a machine"). |
| **Daily Summary** | End-of-day summary: productive vs unproductive time, best streak, worst roast. |
| **Sound Effects** | Optional audio roasts via text-to-speech for maximum shame. |

### v2.0 — Future

| Feature | Description |
|---|---|
| **Leaderboard** | Opt-in competitive mode with friends. Compare productivity scores. |
| **Custom AI Personality** | Choose your roaster: drill sergeant, disappointed parent, Gordon Ramsay, etc. |
| **Website/App Blocking** | If caught on the same distraction 3x in a row, offer to block the site. |
| **Cross-Platform** | Windows and Linux support. |

## Technical Architecture

### Stack

| Component | Technology |
|---|---|
| Desktop App | Electron or Swift (macOS native) |
| Screen Capture | macOS `CGWindowListCreateImage` API or Electron `desktopCapturer` |
| AI Backend | Claude API (claude-sonnet-4-6 vision) or OpenAI GPT-4o |
| Notifications | macOS `NSUserNotification` / `UNUserNotificationCenter` |
| Storage | Local only — SQLite for settings, roast history, productivity log |
| Config | User preferences stored locally (task context, roast level, interval) |

### Flow

```
[Timer: every 3 min]
       |
       v
[Capture Screenshot]
       |
       v
[Send to AI API with prompt + task context]
       |
       v
[AI returns: { productive: bool, activity: string, roast?: string }]
       |
       v
[If not productive → fire notification with roast]
[Log result to local DB]
```

### AI Prompt (Example)

```
You are a brutally honest productivity coach. The user said they should be working on: "{task_context}".

Look at this screenshot of their screen. What are they doing? Are they being productive relative to their stated task?

If they ARE productive: respond with a short encouragement (1 sentence).
If they are NOT productive: roast them. Be funny, specific to what they're actually doing, and savage. Make them feel called out.

Respond as JSON:
{
  "productive": true/false,
  "activity": "what they appear to be doing",
  "message": "your encouragement or roast"
}
```

## Privacy & Security

- Screenshots are **never saved to disk** — held in memory only for the duration of the API call
- Screenshots are sent over HTTPS to the AI provider's API and subject to their data policies
- User must explicitly grant macOS Screen Recording permission
- All data (settings, history) stored locally — no cloud sync in v1
- Users can pause/stop monitoring at any time from the menu bar

## Success Metrics

| Metric | Target |
|---|---|
| Daily active usage | User keeps it running for 4+ hours/day |
| Roast engagement | User doesn't just dismiss — reads and reacts |
| Productivity improvement | Self-reported improvement after 1 week |
| Retention | 50%+ weekly retention after first use |

## Open Questions

1. **Electron vs Swift?** Electron is faster to build and cross-platform. Swift is lighter, more native, better for menu bar apps. Recommend starting with Electron for speed.
2. **Which AI provider?** Claude has strong vision + personality. GPT-4o is also solid. Could support both and let user choose.
3. **Screenshot frequency?** 3 minutes is the default. Should this be configurable? Too frequent = API cost + annoyance. Too infrequent = misses distraction windows.
4. **API cost?** Each screenshot analysis costs ~$0.01-0.03. At 3-min intervals over 8 hours = ~160 calls/day = ~$1.60-4.80/day. Users bring their own API key, or we offer a subscription.

## Monetization

- **Free tier**: Bring your own API key, unlimited use
- **Pro tier ($5/month)**: We provide the API calls, daily summaries, advanced roast personalities, leaderboards
