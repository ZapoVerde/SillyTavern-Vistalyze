You are absolutely right. Asking an LLM to perform string manipulation (like slugifying a name into a key) is a waste of tokens and prone to "LLM-isms" like adding extra commentary. It is much more efficient to handle the `key` programmatically in your `addModal.js` or `pipeline.js`.

The real value of **Step 3 (The Describer)** isn't just generating a pretty picture; it's **creating the "Search Index" for Step 2 (The Classifier).**

If the Describer only returns a visual atmosphere (e.g., *"golden rays of light hitting dust motes"*), the Classifier will fail later when the user simply says *"I walk back to the tavern."* 

To make the system smarter, you should change the prompt to return **Semantic Identity** and **Atmospheric Visuals** as two separate fields.

### The Logic for the New Prompt

1.  **Remove the Key:** Let the code handle `name.toLowerCase().replace(...)`.
2.  **Add "Defining Characteristics":** Ask the LLM to provide a list of semantic markers (e.g., "tavern, bar, inn, drinking, fireplace").
3.  **Separate Visuals from Essence:** Keep the atmospheric description for the image generator, but use the "Essence" to feed the Step 2 Classifier.

---

### The Optimized Prompt Template

Replace your `DEFAULT_DESCRIBER_PROMPT` in `defaults.js` with this:

```text
[SYSTEM: TASK — LOCATION ARCHIVIST]
Analyze the roleplay transcript to identify the current physical location. 

TRANSCRIPT:
{{context}}

INSTRUCTIONS:
1. Identify the most specific active location at the end of the transcript.
2. name: A short, formal label (e.g., "The Silver Swan Tavern").
3. essence: A brief, conceptual definition of what this place IS (e.g., "A crowded medieval pub and inn"). This is used to help a classifier recognize the location later even if the lighting changes.
4. atmosphere: 2-3 sentences of pure visual/sensory detail for an image generator. Focus on lighting, materials, and mood. Do not mention characters.

### OUTPUT FORMAT (JSON ONLY):
{
  "name": "",
  "essence": "",
  "atmosphere": ""
}
```

---

### How this improves your Reasoning/Pipeline

#### 1. Programmatic Key Generation
In `ui/addModal.js`, you already have code that does this:
```javascript
$('#lz-add-name').on('input', function () {
    $('#lz-add-key').val(
        this.value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
    )
});
```
By removing `key` from the LLM prompt, you ensure the key is **always** a perfect 1:1 match of the name you approved, preventing "key drift."

#### 2. Strengthening Step 2 (The Classifier)
Currently, your `DEFAULT_CLASSIFIER_PROMPT` only gives the LLM a list of keys:
`Keys: {{key_list}}`

With the new data, you can eventually update the **Classifier** to be much more accurate by passing it the `essence` of each location:

**Improved Classifier Context (Logic):**
Instead of:
> "Which key matches? [throne_room, dark_forest]"

You can send:
> "Which location matches? 
> - throne_room (The King's Audience Chamber: A formal royal seat of power)
> - dark_forest (The Whispering Woods: A dense, supernatural woodland)"

#### 3. Better Image Generation
By separating `essence` from `atmosphere`, you can choose to interpolate only the `atmosphere` into your Pollinations prompt. This prevents the image generator from getting confused by abstract concepts and keeps it focused on the "cinematic lighting" and "visual details."

### Summary of what to change in `defaults.js`:

1.  **Update `DEFAULT_DESCRIBER_PROMPT`** to the one provided above.
2.  **Update `DEFAULT_IMAGE_PROMPT_TEMPLATE`** to use `{{atmosphere}}` instead of `{{description}}`.
3.  **Update your Step 3 logic** in `detector.js` and `pipeline.js` to expect `def.atmosphere` and `def.essence`.