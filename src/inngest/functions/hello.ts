import { inngest } from "../client";

/** Milestone 0 smoke test: send `app/hello` from the dev dashboard and watch it run. */
export const hello = inngest.createFunction(
  { id: "hello", triggers: [{ event: "app/hello" }] },
  async ({ event, step }) => {
    const greeting = await step.run("greet", () => {
      const name = typeof event.data?.name === "string" ? event.data.name : "neighbor";
      return `Hello, ${name}! The jobs runner is working.`;
    });
    return { greeting };
  },
);
