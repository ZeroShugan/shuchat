import { useCallback } from 'react';
import { useMatrixClient } from './useMatrixClient';
import { useAccountData } from './useAccountData';
import { AccountDataEvent } from '../../types/matrix/accountData';

type NotesMap = Record<string, string>;

export function useUserNotes(targetUserId: string): {
  note: string;
  setNote: (text: string) => Promise<void>;
} {
  const mx = useMatrixClient();
  const notesEvent = useAccountData(AccountDataEvent.ShuChatUserNotes);
  const notes: NotesMap = (notesEvent?.getContent() as NotesMap) ?? {};
  const note = notes[targetUserId] ?? '';

  const setNote = useCallback(
    async (text: string) => {
      const current =
        (mx.getAccountData(AccountDataEvent.ShuChatUserNotes)?.getContent() as NotesMap) ?? {};
      const updated = { ...current };
      if (text) {
        updated[targetUserId] = text;
      } else {
        delete updated[targetUserId];
      }
      await mx.setAccountData(AccountDataEvent.ShuChatUserNotes, updated);
    },
    [mx, targetUserId]
  );

  return { note, setNote };
}
