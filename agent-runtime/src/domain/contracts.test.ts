import test from "node:test";
import assert from "node:assert/strict";
import { stable, planSchema, routerPlanSchema, eventSchema } from "./contracts.js";

test("stable operation IDs match the Go UUIDv5 contract and isolate users", () => {
  assert.equal(
    stable("desktop", "local-user"),
    "1ca5622c-d42e-5286-bb09-a55aec6ce849",
  );
  assert.notEqual(
    stable("job", "u1", "operation"),
    stable("job", "u2", "operation"),
  );
});
test("router plans cannot invent control targets or disabled execution", () => {
  const control = {action:"cancel",ticket_id:"invented",text:""};
  assert.equal(routerPlanSchema(false,[]).safeParse({reply:"ok",control}).success,false);
  assert.equal(routerPlanSchema(true,["owned"]).safeParse({reply:"ok",control}).success,false);
  assert.equal(routerPlanSchema(false,[]).safeParse({reply:"ok",tasks:[{goal:"x",tool:"python",input:{}}]}).success,false);
  assert.equal(routerPlanSchema(false,["owned"]).safeParse({reply:"ok",control:{...control,ticket_id:"owned"}}).success,true);
});
test("plans and versioned events validate before entering domain code", () => {
  assert.equal(
    planSchema.safeParse({
      reply: "ok",
      tasks: [{ goal: "x", tool: "host_shell", input: {} }],
    }).success,
    false,
  );
  assert.equal(eventSchema.safeParse({ version: 2 }).success, false);
  assert.deepEqual(planSchema.parse({ reply: "hello" }), {
    reply: "hello",
    tasks: [],
  });
});
