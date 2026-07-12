import React, { VideoHTMLAttributes, forwardRef } from 'react';
import classNames from 'classnames';
import * as css from './media.css';

const DIAG_EVENTS = [
  'loadstart', 'durationchange', 'loadedmetadata', 'loadeddata', 'canplay', 'playing',
  'waiting', 'stalled', 'suspend', 'abort', 'emptied', 'error',
];

export const Video = forwardRef<HTMLVideoElement, VideoHTMLAttributes<HTMLVideoElement>>(
  ({ className, ...props }, ref) => (
    // eslint-disable-next-line jsx-a11y/media-has-caption
    <video
      className={classNames(css.Video, className)}
      {...props}
      ref={(el) => {
        if (el && !(el as HTMLVideoElement & { __diag?: boolean }).__diag) {
          (el as HTMLVideoElement & { __diag?: boolean }).__diag = true;
          DIAG_EVENTS.forEach((n) =>
            el.addEventListener(n, () => {
              // eslint-disable-next-line no-console
              console.info(
                '[video]', n,
                'readyState=', el.readyState,
                'networkState=', el.networkState,
                el.error ? `MEDIA_ERR code=${el.error.code} msg=${el.error.message}` : ''
              );
            })
          );
        }
        if (typeof ref === 'function') ref(el);
        else if (ref) (ref as React.MutableRefObject<HTMLVideoElement | null>).current = el;
      }}
    />
  )
);
