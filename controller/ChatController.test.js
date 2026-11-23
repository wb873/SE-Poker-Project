const ChatController = require("../controller/ChatController");

function setup(data = {}) {
  const emitted = [];
  const room_emit = jest.fn();
  const io = { to: jest.fn(() => ({ emit: room_emit })) };
  const handlers = {};
  const socket = { data, emit: (e, p) => emitted.push([e, p]), on: (e, h) => { handlers[e] = h; } };
  ChatController.registerChatHandlers(io, socket);
  return { io, socket, handlers, emitted, room_emit };
}

test("a seated player's message goes to the table with their seat name", () => {
  const { io, handlers, room_emit } = setup({ tableLobby: "ABCDE", tableUser: "Will" });
  handlers["chat:send"]({ text: "  hello  " });
  expect(io.to).toHaveBeenCalledWith("table:ABCDE");
  expect(room_emit).toHaveBeenCalledWith("chat:message", expect.objectContaining({ user: "Will", text: "hello" }));
});

test("chatting before joining a table is rejected", () => {
  const { handlers, emitted } = setup();
  handlers["chat:send"]({ text: "hi" });
  expect(emitted).toContainEqual(["chat:error", "Join a table before chatting."]);
});

test("spectators cannot send", () => {
  const { handlers, emitted, room_emit } = setup({ tableLobby: "ABCDE", tableUser: null });
  handlers["chat:send"]({ text: "hi" });
  expect(room_emit).not.toHaveBeenCalled();
  expect(emitted[0][0]).toBe("chat:error");
});

test("empty and overlong messages are rejected", () => {
  const { handlers, emitted, room_emit } = setup({ tableLobby: "ABCDE", tableUser: "Will" });
  handlers["chat:send"]({ text: "   " });
  handlers["chat:send"]({ text: "x".repeat(201) });
  expect(room_emit).not.toHaveBeenCalled();
  expect(emitted).toHaveLength(2);
});

test("non-string text is ignored", () => {
  const { handlers, emitted, room_emit } = setup({ tableLobby: "ABCDE", tableUser: "Will" });
  handlers["chat:send"]({ text: 5 });
  expect(room_emit).not.toHaveBeenCalled();
  expect(emitted).toHaveLength(0);
});

test("sending too fast is blocked", () => {
  const { handlers, emitted, room_emit } = setup({ tableLobby: "ABCDE", tableUser: "Will" });
  handlers["chat:send"]({ text: "one" });
  handlers["chat:send"]({ text: "two" });
  expect(room_emit).toHaveBeenCalledTimes(1);
  expect(emitted).toContainEqual(["chat:error", "You're sending messages too fast."]);
});

test("chat:join is accepted and does nothing", () => {
  const { handlers } = setup();
  expect(() => handlers["chat:join"]({ lobbyId: "ABCDE", username: "x" })).not.toThrow();
});