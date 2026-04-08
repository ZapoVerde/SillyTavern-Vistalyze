# 📍 Localyze

**Localyze** is a SillyTavern extension that brings your roleplay to life by automatically detecting location changes and generating cinematic background images via the [Pollinations API](https://pollinations.ai).

## 🔑 Setup & Requirements

To use **Localyze** effectively, you must configure both your API key and your SillyTavern AI connections.

1. **Obtain a Pollinations Key:** Visit [enter.pollinations.ai](https://pollinations.ai) to generate your API key for image generation.
2. **Configure Extension:** 
   - Open the **Extensions** panel in SillyTavern.
   - Locate **Localyze** and paste your key into the API Key field.
3. **LLM Connections:** 
   - Select an LLM for each step in the settings (see below for model guidance)
   - Select a Pollinations model (typically zimage or flux)

> [!TIP]
> Higher-quality LLMs will provide more accurate location detection and more atmospheric image prompts!


## 🚀 Quick Start Guide

1.  **Installation**: Place the `localyze` folder into `SillyTavern/data/default-user/extensions/`.
2.  **Server Config**: Open `SillyTavern/config.yaml` and ensure `allowKeysExposure: true` is set. Restart SillyTavern.
3.  **API Key**: 
    *   Go to the **SillyTavern Extensions Panel** (the puzzle piece icon).
    *   Find the **Localyze** section.
    *   Enter your **Pollinations API Key** and click **Save to Vault**.
    *   Click **Test Connection** to ensure everything is working.
4.  **Chatting**: Start roleplaying! When your character moves to a new place (e.g., "They stepped into the dimly lit tavern"), Localyze will automatically detect the shift, ask for your approval, and generate a new background.

---

## ⚙️ Configuration & Best Practices

**Localyze** uses a 4-step pipeline to manage background generation. To optimize for both speed and cost, the following LLM setup is recommended for each step:


| Step | Function | Recommended Model Type | Why? |
| :--- | :--- | :--- | :--- |
| **Step 1** | **Location Detection** | **Fast/Cheap** (e.g., Mistral smal 2603) | This runs frequently to check for changes; a small model handles this boolean logic perfectly. |
| **Step 2** | **Location Classifier** | **Mid-Tier** (e.g., Gemini 3.1 Flash Lite Preview) | Categorizes the setting to ensure consistent prompt engineering. |
| **Step 3** | **Scene Description** | **Mid-Tier** (e.g., Gemini 3.1 Flash Lite Preview) | This writes the actual visual prompt.|
| **Step 4** | **Targeted Discovery** | **Mid-Tier** (e.g., Gemini 3.1 Flash Lite Preview)| Provides a keyword guided generation. |

> [!TIP]
> Users can mix and match providers (OpenRouter, local, etc.) for each step directly in the extension settings menu to balance performance and cost.

---

## 🛠 The Location Workshop
Located in your top toolbar, the **Workshop** is your command center for managing the "spatial DNA" of your story. It is divided into three tabs:

*   **Library**: View every location your characters have ever visited in this chat. Click the **Arrow** to jump back to a previous location instantly.
*   **Architect**: Manually edit a location's name, its logical definition (for the AI), or its visual description (for the image generator). 
    *   *Pro Tip:* Use the "Thumbnail Preview" to see a low-cost version of your changes before finalizing.
*   **Explorer**: If the AI missed a transition, use **Force Detect**. You can provide keywords (e.g., "A futuristic laboratory") to guide the AI’s imagination.

---

## 🧠 Transparency: How it Works
Localyze is designed to be fast, cheap, and non-intrusive. It uses a logic pipeline to save you money on LLM tokens:

1.  **Step 1: The Gate (Cheap)**: The AI does a lightning-fast check: "Has the location changed?" If the answer is No, the process stops. You aren't charged for complex analysis on every message.
2.  **Step 2: The Library (Smart)**: If the location *did* change, the AI checks your existing Library first. "Is this a place we've been before?"
3.  **Step 3: The Architect (Creative)**: Only if the location is brand new does the AI write a full visual description and request an image.

---

## 🛡 Data & Privacy
Localyze believes your data belongs to you.
*   **No External Databases**: Your locations, descriptions, and history are stored **inside your chat log (`.jsonl`) file**. 
*   **Fork-Safe**: If you "Move" or "Duplicate" a chat in SillyTavern, your entire location history and all generated images move with it.
*   **Manual Control**: Localyze will **never** overwrite a background you set manually using SillyTavern’s native tools. It respects your choices and only manages the backgrounds it creates.

---

## 🎨 Visual Features
*   **Parallax Effect**: Turn this on in settings to make wide backgrounds respond to your mouse movement or phone tilt, creating a 3D "window" effect.
*   **Message Badges**: Every AI message has a small location icon in the action bar. Click it to retroactively change the location of that specific moment in time.
*   **Self-Healing**: If an image fails to generate because of a network error, Localyze will notice it's missing the next time you open the chat and automatically try to fix it for you.

## ❓ Troubleshooting
*   **Images failing to save?** Ensure `allowKeysExposure: true` is set in your `config.yaml`. Without this, the extension cannot securely access your API key to talk to the image generator.
*   **Orphaned" Images?** Use the **Audit Images** button in settings to find and delete background files belonging to deleted chats, keeping your storage clean.
*   **LLM failing?** Check that you are using the appropriate size LLMs for the job. The step 1 LLM can be small and cheap. The others require a bit more power, but only run occasionally.