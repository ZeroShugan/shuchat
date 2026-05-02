import { MatrixEvent } from 'matrix-js-sdk';
import { measureText } from './pretextMeasure';

const HEIGHTS = {
  text_single_line: 40,
  text_default: 56,
  image: 260,
  video: 260,
  audio: 72,
  file: 72,
  state_event: 32,
  unknown: 48,
} as const;

export const DEFAULT_MESSAGE_HEIGHT = HEIGHTS.text_default;

export function estimateMessageHeight(
  event: MatrixEvent,
  containerWidth: number,
  font: string | undefined
): number {
  const type = event.getType();
  const content = event.getContent();
  const msgType = content?.msgtype as string | undefined;

  if (type !== 'm.room.message') return HEIGHTS.state_event;

  if (msgType === 'm.image' || msgType === 'm.video') return HEIGHTS.image;
  if (msgType === 'm.audio' || msgType === 'm.file') return HEIGHTS.file;

  const body: string = content?.body ?? '';
  if (!body || !font || containerWidth <= 0) return HEIGHTS.text_default;

  const { height } = measureText(body, font, containerWidth, 22);
  return Math.max(height + 16, HEIGHTS.text_single_line);
}
