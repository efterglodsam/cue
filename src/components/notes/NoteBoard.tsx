"use client";

import { useMemo, useState, useTransition } from "react";
import { useRealtimeList } from "@/lib/hooks/useRealtimeList";
import { formatDate, sv } from "@/lib/date-utils";
import { createNote, deleteNote, togglePinNote, updateNote } from "@/lib/actions/notes";
import ConfirmButton from "@/components/ConfirmButton";
import { getFirstName } from "@/lib/profile-utils";
import type { Note, Profile } from "@/lib/supabase/types";

export default function NoteBoard({
  initialNotes,
  profiles,
  currentUserId,
}: {
  initialNotes: Note[];
  profiles: Profile[];
  currentUserId: string;
}) {
  const notesRaw = useRealtimeList<Note>("notes", initialNotes);
  const profileById = useMemo(() => new Map(profiles.map((p) => [p.id, p])), [profiles]);

  const notes = useMemo(
    () =>
      [...notesRaw].sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return b.created_at.localeCompare(a.created_at);
      }),
    [notesRaw],
  );

  return (
    <div className="space-y-4">
      <NewNoteForm />
      <div className="space-y-3">
        {notes.length === 0 && (
          <p className="text-sm text-slate-500">Inga anteckningar än — skriv den första!</p>
        )}
        {notes.map((note) => (
          <NoteCard
            key={note.id}
            note={note}
            author={profileById.get(note.author_id)}
            isMine={note.author_id === currentUserId}
          />
        ))}
      </div>
    </div>
  );
}

function NewNoteForm() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createNote(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setExpanded(false);
      const form = document.getElementById("new-note-form") as HTMLFormElement | null;
      form?.reset();
    });
  }

  return (
    <form
      id="new-note-form"
      action={handleSubmit}
      className="rounded-xl border border-slate-700 bg-slate-900 p-3"
    >
      <textarea
        name="body"
        required
        onFocus={() => setExpanded(true)}
        rows={expanded ? 3 : 1}
        placeholder="Skriv en anteckning till teamet…"
        className="w-full resize-none rounded-lg border-none bg-transparent p-1 text-sm text-slate-100 outline-none placeholder:text-slate-500"
      />
      {expanded && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            name="title"
            placeholder="Rubrik (valfritt)"
            className="rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-slate-100"
          />
          <input
            name="category"
            placeholder="Kategori (valfritt)"
            className="rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-slate-100"
          />
          <label className="flex items-center gap-1 text-xs text-slate-300">
            <input type="checkbox" name="pinned" /> Fäst högst upp
          </label>
          <div className="ml-auto flex gap-2">
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-400"
            >
              Avbryt
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {isPending ? "Postar…" : "Posta"}
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </form>
  );
}

function NoteCard({ note, author, isMine }: { note: Note; author?: Profile; isMine: boolean }) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (editing) {
    return (
      <form
        action={(formData) =>
          startTransition(async () => {
            const result = await updateNote(note.id, formData);
            if (!result.ok) setError(result.error);
            else setEditing(false);
          })
        }
        className="rounded-xl border border-blue-800 bg-blue-950/40 p-3"
      >
        <input
          name="title"
          defaultValue={note.title ?? ""}
          placeholder="Rubrik (valfritt)"
          className="mb-2 w-full rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-sm text-slate-100"
        />
        <textarea
          name="body"
          defaultValue={note.body}
          required
          rows={3}
          className="w-full rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-sm text-slate-100"
        />
        <input
          name="category"
          defaultValue={note.category ?? ""}
          placeholder="Kategori (valfritt)"
          className="mt-2 w-full rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-slate-100"
        />
        {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-400"
          >
            Avbryt
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            Spara
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className={`rounded-xl border p-3 ${note.pinned ? "border-amber-700 bg-amber-950" : "border-slate-700 bg-slate-900"}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          {note.pinned && <span className="mr-1 text-xs">📌</span>}
          {note.title && <p className="font-semibold text-slate-100">{note.title}</p>}
          <p className="whitespace-pre-wrap text-sm text-slate-200">{note.body}</p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <span>
          {getFirstName(author?.full_name)} ·{" "}
          {formatDate(new Date(note.created_at), "d MMM HH:mm", { locale: sv })}
          {note.category ? ` · ${note.category}` : ""}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              startTransition(async () => {
                await togglePinNote(note.id, !note.pinned);
              })
            }
            className="font-medium text-slate-400 hover:text-slate-200"
          >
            {note.pinned ? "Lossa" : "Fäst"}
          </button>
          {isMine && (
            <>
              <button onClick={() => setEditing(true)} className="font-medium text-blue-400">
                Redigera
              </button>
              <ConfirmButton
                onConfirm={() => deleteNote(note.id)}
                label="Ta bort"
                className="font-medium text-red-400"
                confirmText="Ta bort anteckningen?"
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
