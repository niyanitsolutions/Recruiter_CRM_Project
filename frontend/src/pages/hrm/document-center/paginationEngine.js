/**
 * Shared Document Pagination Engine
 *
 * Used identically by:
 *   - QuickBuilder WysiwygDocument (editor)
 *   - PaginatedDocPreview (preview modal)
 *   - PDF / DOCX export helpers
 *
 * This single module guarantees editor === preview === export page counts.
 */

export const DOC_FONT_SIZE   = '12pt'
export const DOC_LINE_HEIGHT = '1.7'
export const DOC_FONT_FAMILY = 'Arial, sans-serif'
export const DOC_TEXT_COLOR  = '#1f2937'

/**
 * Measure every top-level child element's height inside a hidden off-screen
 * container that exactly matches the rendered document column width and font.
 *
 * @param {string}  html      - Inner HTML to measure
 * @param {number}  contentW  - Column width in px (pageWidth - marginLeft - marginRight)
 * @returns {Promise<Array<{html:string, height:number}>>}
 */
export function measureBlocks(html, contentW) {
  return new Promise(resolve => {
    if (!html || !html.trim()) { resolve([]); return }

    const c = document.createElement('div')
    c.setAttribute('aria-hidden', 'true')
    Object.assign(c.style, {
      position: 'absolute', top: '-9999px', left: '-9999px',
      width:      `${contentW}px`,
      fontSize:   DOC_FONT_SIZE,
      lineHeight: DOC_LINE_HEIGHT,
      fontFamily: DOC_FONT_FAMILY,
      color:      DOC_TEXT_COLOR,
      visibility: 'hidden',
      pointerEvents: 'none',
    })
    c.innerHTML = html
    document.body.appendChild(c)

    requestAnimationFrame(() => {
      const children = Array.from(c.children)
      let blocks

      if (children.length === 0) {
        blocks = [{ html, height: Math.max(c.scrollHeight, 20) }]
      } else {
        blocks = children.map(el => {
          const cs = window.getComputedStyle(el)
          const mTop = parseFloat(cs.marginTop)    || 0
          const mBot = parseFloat(cs.marginBottom) || 0
          return {
            html:   el.outerHTML,
            height: Math.max((el.offsetHeight || 16) + mTop + mBot, 4),
          }
        })
      }

      document.body.removeChild(c)
      resolve(blocks)
    })
  })
}

/**
 * Distribute an array of measured blocks into pages, never splitting a block.
 * A block that is taller than a full page is placed alone on its own page.
 *
 * @param {Array<{html:string, height:number}>} blocks
 * @param {number} usableH  - Usable content height per page in px
 * @returns {Array<Array<{html:string, height:number}>>}
 */
export function distributeToPages(blocks, usableH) {
  if (!blocks.length) return [[]]

  const pages  = [[]]
  let   usedH  = 0

  for (const block of blocks) {
    const bh = Math.max(block.height, 4)

    // Block taller than a page → give it its own page, then start fresh
    if (bh >= usableH) {
      if (usedH > 0) { pages.push([]); usedH = 0 }
      pages[pages.length - 1].push(block)
      pages.push([]); usedH = 0
      continue
    }

    // Normal case: overflow to next page when remaining space is insufficient
    if (usedH + bh > usableH && usedH > 0) {
      pages.push([])
      usedH = 0
    }

    pages[pages.length - 1].push(block)
    usedH += bh
  }

  // Drop trailing empty page
  while (pages.length > 1 && pages[pages.length - 1].length === 0) pages.pop()

  return pages
}

/**
 * Full pagination: measure blocks then distribute.
 *
 * @param {string}  html
 * @param {{ contentW: number, usableH: number }} opts
 * @returns {Promise<Array<Array<{html:string, height:number}>>>}
 */
export async function paginate(html, { contentW, usableH }) {
  const blocks = await measureBlocks(html, contentW)
  return distributeToPages(blocks, usableH)
}
