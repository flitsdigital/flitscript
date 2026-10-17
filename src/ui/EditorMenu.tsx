import { Download, FilePlus2, Merge, Pause, Play, Plus, Replace, Scissors, Trash } from "lucide-react";
import type { ReactNode } from "react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

export type MenuActions = {
  playing: boolean;
  /** The caption the menu acts on: the selected block, else the one under the playhead. */
  hasCaption: boolean;
  hasNext: boolean;
  canSplit: boolean;
  canAdd: boolean;
  addCaption: () => void;
  canExport: boolean;
  playPause: () => void;
  split: () => void;
  mergeNext: () => void;
  deleteCaption: () => void;
  replaceVideo: () => void;
  newVideo: () => void;
  exportVideo: () => void;
};

/** Right-click menu shared by the preview and the timeline. */
export function EditorMenu({ actions: a, children }: { actions: MenuActions; children: ReactNode }) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      {/* Keep clear of the window edges so the last item never touches the bottom of the screen. */}
      <ContextMenuContent className="w-64" collisionPadding={12}>
        <ContextMenuItem onSelect={a.playPause}>
          {a.playing ? <Pause /> : <Play />}
          {a.playing ? "Pauzeren" : "Afspelen"}
          <ContextMenuShortcut>Spatie</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem disabled={!a.canAdd} onSelect={a.addCaption}>
          <Plus />
          Caption toevoegen
        </ContextMenuItem>
        <ContextMenuItem disabled={!a.canSplit} onSelect={a.split}>
          <Scissors />
          Splitsen op afspeelpositie
          <ContextMenuShortcut>S</ContextMenuShortcut>
        </ContextMenuItem>
        {a.hasCaption && (
          <>
            <ContextMenuItem disabled={!a.hasNext} onSelect={a.mergeNext}>
              <Merge />
              Samenvoegen met volgende
            </ContextMenuItem>
            <ContextMenuItem variant="destructive" onSelect={a.deleteCaption}>
              <Trash />
              Caption verwijderen
              <ContextMenuShortcut>⌫</ContextMenuShortcut>
            </ContextMenuItem>
          </>
        )}
        <ContextMenuSeparator />
        <ContextMenuLabel>Video</ContextMenuLabel>
        <ContextMenuItem onSelect={a.replaceVideo}>
          <Replace />
          <span className="flex flex-col">
            Video vervangen…
            <span className="text-xs text-muted-foreground">Captions en stijl blijven staan</span>
          </span>
        </ContextMenuItem>
        <ContextMenuItem onSelect={a.newVideo}>
          <FilePlus2 />
          <span className="flex flex-col">
            Nieuwe video…
            <span className="text-xs text-muted-foreground">Opnieuw beginnen</span>
          </span>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem disabled={!a.canExport} onSelect={a.exportVideo}>
          <Download />
          Exporteren…
          <ContextMenuShortcut>⌘E</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
