import React, {
  MouseEventHandler,
  ReactNode,
  RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  draggable,
  dropTargetForElements,
  monitorForElements,
} from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { autoScrollForElements } from '@atlaskit/pragmatic-drag-and-drop-auto-scroll/element';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import {
  Box,
  Icon,
  IconButton,
  Icons,
  Menu,
  MenuItem,
  PopOut,
  RectCords,
  Text,
  color,
  config,
  toRem,
} from 'folds';
import FocusTrap from 'focus-trap-react';
import { NavCategoryHeader } from '../nav';
import { RoomNavCategoryButton } from '../../features/room-nav';
import { stopPropagation } from '../../utils/keyboard';

// ---- Drag & drop data shapes (space room categorization) ----

export type CategoryDragData = {
  shuRoom: true;
  roomId: string;
  catId: string;
};

export type CategoryDropData =
  | { shuTarget: 'cat'; catId: string } // append at the end of a category
  | { shuTarget: 'after'; catId: string; afterRoomId: string } // insert after a room
  | { shuTarget: 'new-cat' }; // create a brand-new category with the room

export type CanDropOnCategory = (drag: CategoryDragData, drop: CategoryDropData) => boolean;

const isCategoryDrag = (data: unknown): data is CategoryDragData =>
  typeof data === 'object' && data !== null && (data as CategoryDragData).shuRoom === true;

/** Make a room row draggable. Returns whether THIS row is being dragged. */
export const useCategoryRoomDraggable = (
  targetRef: RefObject<HTMLElement>,
  data: CategoryDragData,
  enabled: boolean,
  onDragging: (data?: CategoryDragData) => void
): boolean => {
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const target = targetRef.current;
    if (!target || !enabled) return undefined;
    return draggable({
      element: target,
      getInitialData: () => data,
      onDragStart: () => {
        setDragging(true);
        onDragging(data);
      },
      onDrop: () => {
        setDragging(false);
        onDragging(undefined);
      },
    });
  }, [targetRef, data, enabled, onDragging]);

  return dragging;
};

/** Global monitor: reports drag state and completed drops. */
export const useCategoryDropMonitor = (
  scrollRef: RefObject<HTMLElement>,
  onDragging: (data?: CategoryDragData) => void,
  onDrop: (drag: CategoryDragData, drop: CategoryDropData) => void
) => {
  useEffect(() => {
    const scrollElement = scrollRef.current;
    if (!scrollElement) return undefined;

    return combine(
      monitorForElements({
        onDrop: ({ source, location }) => {
          onDragging(undefined);
          if (!isCategoryDrag(source.data)) return;
          const { dropTargets } = location.current;
          if (dropTargets.length === 0) return;
          onDrop(source.data, dropTargets[0].data as unknown as CategoryDropData);
        },
      }),
      autoScrollForElements({ element: scrollElement })
    );
  }, [scrollRef, onDragging, onDrop]);
};

type DropIndicatorState = 'idle' | 'allow' | 'not-allow';

const useDropTarget = (
  targetRef: RefObject<HTMLElement>,
  drop: CategoryDropData,
  canDrop: CanDropOnCategory,
  enabled: boolean
): DropIndicatorState => {
  const [state, setState] = useState<DropIndicatorState>('idle');

  useEffect(() => {
    const target = targetRef.current;
    if (!target || !enabled) return undefined;
    return dropTargetForElements({
      element: target,
      getData: () => drop as unknown as Record<string, unknown>,
      onDragEnter: ({ source }) => {
        if (isCategoryDrag(source.data)) {
          setState(canDrop(source.data, drop) ? 'allow' : 'not-allow');
        }
      },
      onDragLeave: () => setState('idle'),
      onDrop: () => setState('idle'),
    });
  }, [targetRef, drop, canDrop, enabled]);

  return state;
};

/** Thin insert line rendered under a room row while a drag is active. */
type RoomDropLineProps = {
  catId: string;
  afterRoomId: string;
  canDrop: CanDropOnCategory;
};
export function RoomDropLine({ catId, afterRoomId, canDrop }: RoomDropLineProps) {
  const ref = useRef<HTMLDivElement>(null);
  const state = useDropTarget(ref, { shuTarget: 'after', catId, afterRoomId }, canDrop, true);

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: -4,
        height: 8,
        zIndex: 1,
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <div
        style={{
          width: '100%',
          height: 3,
          borderRadius: 2,
          background:
            state === 'allow'
              ? color.Primary.Main
              : state === 'not-allow'
              ? color.Critical.Main
              : 'transparent',
        }}
      />
    </div>
  );
}

/** Dashed zone shown while dragging — drop a room here to create a new category. */
type NewCategoryDropZoneProps = {
  canDrop: CanDropOnCategory;
};
export function NewCategoryDropZone({ canDrop }: NewCategoryDropZoneProps) {
  const ref = useRef<HTMLDivElement>(null);
  const state = useDropTarget(ref, { shuTarget: 'new-cat' }, canDrop, true);

  return (
    <Box
      ref={ref}
      justifyContent="Center"
      alignItems="Center"
      style={{
        margin: config.space.S200,
        padding: config.space.S300,
        borderRadius: config.radii.R400,
        border: `2px dashed ${state === 'allow' ? color.Primary.Main : color.Surface.ContainerLine}`,
        background: state === 'allow' ? color.Primary.Container : undefined,
        minHeight: toRem(44),
      }}
    >
      <Text size="T200" priority="300" align="Center">
        Drop here to create a new category
      </Text>
    </Box>
  );
}

// ---- Category header (collapse chip + "+" add menu + rename/delete menu) ----

export type AddRoomCandidate = { roomId: string; name: string };

type SpaceCategoryHeaderProps = {
  navCategoryId: string;
  name: string;
  closed: boolean;
  onToggle: MouseEventHandler<HTMLButtonElement>;
  canManage: boolean;
  custom: boolean;
  addCandidates: AddRoomCandidate[];
  onAdd: (roomId: string) => void;
  onRename?: () => void;
  onDelete?: () => void;
  /** Drop-target wiring: appending a dragged room to this category. */
  dndCatId?: string;
  canDrop: CanDropOnCategory;
};

export function SpaceCategoryHeader({
  navCategoryId,
  name,
  closed,
  onToggle,
  canManage,
  custom,
  addCandidates,
  onAdd,
  onRename,
  onDelete,
  dndCatId,
  canDrop,
}: SpaceCategoryHeaderProps) {
  const headerRef = useRef<HTMLDivElement>(null);
  const dropState = useDropTarget(
    headerRef,
    { shuTarget: 'cat', catId: dndCatId ?? '' },
    canDrop,
    dndCatId !== undefined
  );

  const [addAnchor, setAddAnchor] = useState<RectCords>();
  const [menuAnchor, setMenuAnchor] = useState<RectCords>();

  const handleAddOpen: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setAddAnchor(evt.currentTarget.getBoundingClientRect());
  };
  const handleMenuOpen: MouseEventHandler<HTMLButtonElement> = (evt) => {
    setMenuAnchor(evt.currentTarget.getBoundingClientRect());
  };

  return (
    <div
      ref={headerRef}
      style={{
        borderRadius: config.radii.R400,
        outline: dropState === 'allow' ? `2px solid ${color.Primary.Main}` : undefined,
        background: dropState === 'allow' ? color.Primary.Container : undefined,
      }}
    >
      <NavCategoryHeader>
        <Box grow="Yes" alignItems="Center" justifyContent="SpaceBetween" gap="100">
          <RoomNavCategoryButton data-category-id={navCategoryId} onClick={onToggle} closed={closed}>
            {name}
          </RoomNavCategoryButton>
          {canManage && (
            <Box shrink="No" alignItems="Center" gap="100">
              <IconButton
                size="300"
                radii="Pill"
                variant="Background"
                aria-label="Add room to category"
                onClick={handleAddOpen}
                aria-pressed={!!addAnchor}
              >
                <Icon size="50" src={Icons.Plus} />
              </IconButton>
              {custom && (
                <IconButton
                  size="300"
                  radii="Pill"
                  variant="Background"
                  aria-label="Category options"
                  onClick={handleMenuOpen}
                  aria-pressed={!!menuAnchor}
                >
                  <Icon size="50" src={Icons.VerticalDots} />
                </IconButton>
              )}
            </Box>
          )}
        </Box>
      </NavCategoryHeader>
      {addAnchor && (
        <PopOut
          anchor={addAnchor}
          position="Bottom"
          align="End"
          offset={4}
          content={
            <FocusTrap
              focusTrapOptions={{
                initialFocus: false,
                onDeactivate: () => setAddAnchor(undefined),
                clickOutsideDeactivates: true,
                isKeyForward: (evt: KeyboardEvent) => evt.key === 'ArrowDown',
                isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp',
                escapeDeactivates: stopPropagation,
              }}
            >
              <Menu style={{ maxHeight: '50vh', overflowY: 'auto' }}>
                <Box direction="Column" style={{ padding: config.space.S100, minWidth: toRem(180) }}>
                  <Box style={{ padding: config.space.S100 }}>
                    <Text size="L400">Add room</Text>
                  </Box>
                  {addCandidates.length === 0 && (
                    <Box style={{ padding: config.space.S100 }}>
                      <Text size="T200" priority="300">
                        No rooms to add
                      </Text>
                    </Box>
                  )}
                  {addCandidates.map((c) => (
                    <MenuItem
                      key={c.roomId}
                      size="300"
                      variant="Surface"
                      radii="300"
                      onClick={() => {
                        setAddAnchor(undefined);
                        onAdd(c.roomId);
                      }}
                    >
                      <Text size="B300" truncate>
                        {c.name}
                      </Text>
                    </MenuItem>
                  ))}
                </Box>
              </Menu>
            </FocusTrap>
          }
        />
      )}
      {menuAnchor && (
        <PopOut
          anchor={menuAnchor}
          position="Bottom"
          align="End"
          offset={4}
          content={
            <FocusTrap
              focusTrapOptions={{
                initialFocus: false,
                onDeactivate: () => setMenuAnchor(undefined),
                clickOutsideDeactivates: true,
                isKeyForward: (evt: KeyboardEvent) => evt.key === 'ArrowDown',
                isKeyBackward: (evt: KeyboardEvent) => evt.key === 'ArrowUp',
                escapeDeactivates: stopPropagation,
              }}
            >
              <Menu>
                <Box direction="Column" style={{ padding: config.space.S100, minWidth: toRem(140) }}>
                  <MenuItem
                    size="300"
                    variant="Surface"
                    radii="300"
                    onClick={() => {
                      setMenuAnchor(undefined);
                      onRename?.();
                    }}
                  >
                    <Text size="B300" truncate>
                      Rename
                    </Text>
                  </MenuItem>
                  <MenuItem
                    size="300"
                    variant="Critical"
                    fill="None"
                    radii="300"
                    onClick={() => {
                      setMenuAnchor(undefined);
                      onDelete?.();
                    }}
                  >
                    <Text size="B300" truncate>
                      Delete Category
                    </Text>
                  </MenuItem>
                </Box>
              </Menu>
            </FocusTrap>
          }
        />
      )}
    </div>
  );
}

/** Wrapper for a draggable room row + insert-line drop target below it. */
type DraggableRoomRowProps = {
  roomId: string;
  catId: string;
  canDrag: boolean;
  draggingActive: boolean;
  canDrop: CanDropOnCategory;
  onDragging: (data?: CategoryDragData) => void;
  children: ReactNode;
};
export function DraggableRoomRow({
  roomId,
  catId,
  canDrag,
  draggingActive,
  canDrop,
  onDragging,
  children,
}: DraggableRoomRowProps) {
  const ref = useRef<HTMLDivElement>(null);
  const dragData: CategoryDragData = useMemo(
    () => ({ shuRoom: true, roomId, catId }),
    [roomId, catId]
  );
  const selfDragging = useCategoryRoomDraggable(ref, dragData, canDrag, onDragging);

  // Links and images inside the row are natively draggable and would hijack
  // the drag before pragmatic-dnd sees it — disable their native drag.
  useEffect(() => {
    if (!canDrag) return;
    ref.current?.querySelectorAll('a, img').forEach((el) => {
      (el as HTMLElement).draggable = false;
    });
  });

  return (
    <div ref={ref} style={{ position: 'relative', opacity: selfDragging ? 0.4 : 1 }}>
      {children}
      {draggingActive && !selfDragging && (
        <RoomDropLine catId={catId} afterRoomId={roomId} canDrop={canDrop} />
      )}
    </div>
  );
}
