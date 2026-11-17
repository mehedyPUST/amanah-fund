/**
 * Scrolls a horizontal filter/tab bar smoothly when an option is tapped so that
 * both adjacent ("two sides") buttons become visible inside the container.
 *
 * - If [prev + active + next] fits within the container's visible width, shifts
 *   scrollLeft just enough to bring both neighbors comfortably inside the view.
 * - On very narrow screens where [prev + active + next] exceeds the visible
 *   width, centers the tapped button so portions of both left and right
 *   neighbors stay visible on either side.
 */
export function scrollFilterButtonWithNeighbors(
  clickedEl: HTMLElement | null | undefined,
  containerEl?: HTMLElement | null
): void {
  if (!clickedEl) return;
  const container = containerEl ?? clickedEl.parentElement;
  if (!container) return;

  const clientWidth = container.clientWidth;
  const scrollWidth = container.scrollWidth;
  if (scrollWidth <= clientWidth + 1) return;

  const buttons = Array.from(container.children).filter(
    (el): el is HTMLElement => el instanceof HTMLElement && el.offsetWidth > 0
  );
  const idx = buttons.indexOf(clickedEl);
  if (idx === -1) return;

  const prevEl = idx > 0 ? buttons[idx - 1] : null;
  const nextEl = idx < buttons.length - 1 ? buttons[idx + 1] : null;

  const cRect = container.getBoundingClientRect();
  const currentScroll = container.scrollLeft;
  const maxScroll = Math.max(0, scrollWidth - clientWidth);
  const edgePad = 12;

  const leftEdgeEl = prevEl ?? clickedEl;
  const rightEdgeEl = nextEl ?? clickedEl;

  const leftRect = leftEdgeEl.getBoundingClientRect();
  const rightRect = rightEdgeEl.getBoundingClientRect();
  const clickedRect = clickedEl.getBoundingClientRect();

  const groupLeft = leftRect.left - cRect.left + currentScroll;
  const groupRight = rightRect.right - cRect.left + currentScroll;
  const groupWidth = groupRight - groupLeft;

  let targetScroll = currentScroll;

  if (groupWidth + edgePad * 2 <= clientWidth) {
    if (groupLeft - edgePad < currentScroll) {
      targetScroll = groupLeft - edgePad;
    } else if (groupRight + edgePad > currentScroll + clientWidth) {
      targetScroll = groupRight + edgePad - clientWidth;
    }
  } else {
    const clickedCenter =
      clickedRect.left - cRect.left + currentScroll + clickedRect.width / 2;
    targetScroll = clickedCenter - clientWidth / 2;
  }

  const clamped = Math.max(0, Math.min(maxScroll, Math.round(targetScroll)));
  if (Math.abs(clamped - currentScroll) <= 1) return;

  if (typeof container.scrollTo === 'function') {
    container.scrollTo({ left: clamped, behavior: 'smooth' });
  } else {
    container.scrollLeft = clamped;
  }
}
