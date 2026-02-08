# AlgoTutor Tool Annotation Justifications

Justifications for each MCP tool annotation, for the OpenAI App Store submission.

---

## learn_mode

**Read Only: Yes**
This tool generates a DSA lesson and returns it for display in the widget. It does not modify any user-facing data, files, or external state. Internal server-side usage logging does not constitute a user-visible side effect.

**Open World: Yes**
This tool calls the OpenAI API to generate educational content and connects to Supabase for authentication and internal usage logging.

**Destructive: No**
This tool only generates and returns educational content. It does not delete, overwrite, or irreversibly modify any data. It is safe to retry without side effects.

---

## learn_trace_walkthrough

**Read Only: Yes**
This tool generates a trace table and step-by-step walkthrough for a DSA topic and returns it for display. It does not modify any user-facing data or external state.

**Open World: Yes**
This tool calls the OpenAI API to generate the trace walkthrough content and connects to Supabase for authentication.

**Destructive: No**
This tool only generates and returns educational content. It does not delete, overwrite, or irreversibly modify any data. Safe to retry.

---

## learn_real_world_example

**Read Only: Yes**
This tool generates an interactive fill-in-the-blank practice problem and returns it for display. It does not modify any user-facing data or external state.

**Open World: Yes**
This tool calls the OpenAI API (gpt-4.1) to generate the practice problem and connects to Supabase for authentication.

**Destructive: No**
This tool only generates and returns a practice problem. It does not delete, overwrite, or irreversibly modify any data. Safe to retry.

---

## build_mode

**Read Only: Yes**
This tool generates a complete coded solution for a given problem and returns it for display in the widget. It does not modify any user-facing data, files, or external state. Internal server-side usage logging does not constitute a user-visible side effect.

**Open World: Yes**
This tool calls the OpenAI API (gpt-4.1) to generate the solution and connects to Supabase for authentication and internal usage logging.

**Destructive: No**
This tool only generates and returns a coded solution. It does not delete, overwrite, or irreversibly modify any data. Safe to retry.

---

## build_trace_walkthrough

**Read Only: Yes**
This tool generates a dry-run trace table and walkthrough for a Build Mode solution and returns it for display. It does not modify any user-facing data or external state.

**Open World: Yes**
This tool calls the OpenAI API (gpt-4.1) to generate the trace content and connects to Supabase for authentication.

**Destructive: No**
This tool only generates and returns trace content. It does not delete, overwrite, or irreversibly modify any data. Safe to retry.

---

## build_similar_problem

**Read Only: Yes**
This tool generates a fill-in-the-blank practice problem related to a Build Mode solution and returns it for display. It does not modify any user-facing data or external state.

**Open World: Yes**
This tool calls the OpenAI API (gpt-4.1) to generate the practice problem and connects to Supabase for authentication.

**Destructive: No**
This tool only generates and returns a practice problem. It does not delete, overwrite, or irreversibly modify any data. Safe to retry.

---

## debug_mode

**Read Only: Yes**
This tool analyzes user-submitted code for bugs and returns a diagnosis for display in the widget. It does not modify the user's code, files, or any external state. Internal server-side usage logging does not constitute a user-visible side effect.

**Open World: Yes**
This tool calls the OpenAI API (gpt-4.1) to analyze the code and connects to Supabase for authentication and internal usage logging.

**Destructive: No**
This tool only analyzes code and returns a diagnosis. It does not delete, overwrite, or irreversibly modify any data. Safe to retry.

---

## debug_trace_walkthrough

**Read Only: Yes**
This tool generates a trace table and walkthrough for code from Debug Mode and returns it for display. It does not modify any user-facing data or external state.

**Open World: Yes**
This tool calls the OpenAI API (gpt-4.1) to generate the trace content and connects to Supabase for authentication.

**Destructive: No**
This tool only generates and returns trace content. It does not delete, overwrite, or irreversibly modify any data. Safe to retry.

---

## debug_similar_problem

**Read Only: Yes**
This tool generates a fill-in-the-blank practice problem related to debugged code and returns it for display. It does not modify any user-facing data or external state.

**Open World: Yes**
This tool calls the OpenAI API (gpt-4.1) to generate the practice problem and connects to Supabase for authentication.

**Destructive: No**
This tool only generates and returns a practice problem. It does not delete, overwrite, or irreversibly modify any data. Safe to retry.

---

## ai_recommendation

**Read Only: Yes**
This tool generates a personalized study recommendation based on quiz performance data and returns it for display. It does not modify any user-facing data or external state.

**Open World: Yes**
This tool calls the OpenAI API (gpt-4.1) to generate the recommendation and connects to Supabase for authentication.

**Destructive: No**
This tool only generates and returns a study recommendation. It does not delete, overwrite, or irreversibly modify any data. Safe to retry.

---

## list_algo_sessions

**Read Only: Yes**
This tool returns recent sessions from an in-memory array. It does not modify any data or state.

**Open World: No**
This tool reads from an in-memory server-side array only. It does not call any external APIs or services.

**Destructive: No**
This tool only reads and returns data. It does not delete, overwrite, or modify anything. Safe to retry.
