import { useState } from "react";
import { Editor } from "./Editor";
import { Home, type OpenedProject } from "./Home";
import { AuthGate } from "./Login";

export function App() {
  const [opened, setOpened] = useState<OpenedProject | null>(null);
  return (
    <AuthGate>
      {(session) => (opened ? <Editor key={opened.id} opened={opened} onExit={() => setOpened(null)} /> : <Home session={session} onOpen={setOpened} />)}
    </AuthGate>
  );
}
