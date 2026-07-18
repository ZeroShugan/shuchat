import React, { MouseEventHandler, RefObject, useState } from 'react';
import { Icon, IconButton, Icons, PopOut, RectCords } from 'folds';
import { EmojiBoard } from '../emoji-board';

type EmojiPickerButtonProps = {
  /** Ref to the text input the picked emoji is inserted into (at the caret). */
  inputRef: RefObject<HTMLInputElement | null>;
  disabled?: boolean;
};

/**
 * Small smiley button for name fields (room/space create + rename). Opens the
 * emoji board and inserts the picked unicode emoji at the input caret. The
 * board stays open so several emojis can be added; click outside or Esc
 * closes it. Only unicode emojis are offered — custom image emojis can't be
 * part of a room name.
 */
export function EmojiPickerButton({ inputRef, disabled }: EmojiPickerButtonProps) {
  const [anchor, setAnchor] = useState<RectCords>();

  const handleOpen: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setAnchor(anchor ? undefined : evt.currentTarget.getBoundingClientRect());
  };

  const handleEmojiSelect = (unicode: string) => {
    const input = inputRef.current;
    if (!input) return;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    input.value = input.value.slice(0, start) + unicode + input.value.slice(end);
    const caret = start + unicode.length;
    input.focus();
    input.setSelectionRange(caret, caret);
    // notify any listeners (e.g. React controlled inputs) of the change
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };

  return (
    <PopOut
      anchor={anchor}
      position="Bottom"
      align="End"
      content={
        <EmojiBoard
          imagePackRooms={[]}
          returnFocusOnDeactivate={false}
          addToRecentEmoji={false}
          onEmojiSelect={handleEmojiSelect}
          requestClose={() => setAnchor(undefined)}
        />
      }
    >
      <IconButton
        type="button"
        size="300"
        radii="300"
        variant="SurfaceVariant"
        aria-label="Insert Emoji"
        aria-pressed={!!anchor}
        disabled={disabled}
        onClick={handleOpen}
      >
        <Icon size="100" src={Icons.Smile} />
      </IconButton>
    </PopOut>
  );
}
