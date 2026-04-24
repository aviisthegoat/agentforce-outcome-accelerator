/**
 * Template for generating customer segment descriptions as structured customer profiles.
 * Used when generating the business profile "Customer Segments" field so output
 * is consistent with persona/customer profile format.
 */
export const customerSegmentTemplate = `# Customer Segment Profile Template

For each target customer segment, fill in the following structure. Output 2–4 segments as a single document.

---

## SEGMENT [N]: [Segment Name]

### Identity
- **Who:** [Primary role, title, or persona type]
- **Organization type/size:** [e.g. SMB, Enterprise, Consumer]
- **Industry/context:** [Where they operate]

### Needs & Jobs-to-be-done
- **Functional job:** [What they are trying to get done]
- **Emotional job:** [How they want to feel]
- **Social job:** [How they want to be perceived]

### Behaviors & triggers
- **Decision triggers:** [What prompts them to act]
- **Key criteria:** [What they evaluate when choosing]
- **Barriers/objections:** [What holds them back]

### How we reach them
- **Channels:** [Where they can be reached]
- **Messaging angle:** [What resonates]

---

Repeat for each segment. Keep each segment concise (2–4 short paragraphs or bullets).`;
