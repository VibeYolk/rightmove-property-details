# Rightmove Property Details Extension

This is an independently developed, unofficial browser extension. It is not affiliated with, partnered with, or endorsed by Rightmove.

This local test version for Chrome and Microsoft Edge displays property size, Council Tax band, ground rent, service charge and remaining lease on search result cards near the visible area of the page, without requiring you to open each property listing.

## Before you use it

Sections 5.2 and 5.5 of [Rightmove's terms of use](https://www.rightmove.co.uk/c/terms-of-use/) restrict automated access and data extraction. This extension automatically requests property detail pages, so you need Rightmove's written permission before using it. If it receives a 403 or 429 response, it stops making automatic requests; it does not bypass access restrictions.

## Installation

Once you have permission, select **Code → Download ZIP** on the GitHub repository page and extract the archive. Then:

1. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge.
2. Enable **Developer mode** in the upper-right corner.
3. Click **Load unpacked** and select the extracted folder containing this README and `manifest.json`.
4. Open or refresh a Rightmove property sale or rental search results page. Scroll down to see the extra details.

If you have an older version installed, extract the new version, remove the old extension from the extensions page, load the new folder as described above, and refresh the Rightmove search results page. Alternatively, replace the files in the existing extension folder, click the extension's reload button on the extensions page, and then refresh the Rightmove search results page.

The extension is not published in the Chrome Web Store. It requests detail pages for the current search results from `www.rightmove.co.uk` and may request their floorplans from `media.rightmove.co.uk`; it does not send data to other websites. Requests are made sequentially, at least 1.5 seconds apart. Results are cached in extension memory for up to 30 minutes, although the browser may clear them sooner.

Automatic floorplan OCR is off by default. If a search result has a floorplan but no identifiable property size, click **Scan floorplan** on that card to scan just that property. You can also click the extension icon in the browser toolbar and enable **自动识别户型图面积** (automatically scan floorplans). When you turn it off again, queued automatic scans will not start and any automatic download in progress will be aborted. Recognition already running on your computer may finish, but its result will not update the card. Basic property details appear first, without waiting for image recognition.

During a scan, the extension downloads one floorplan image for the property from `media.rightmove.co.uk` and recognises text locally using the bundled Tesseract engine and English language model. Neither the image nor the recognised text is sent to another OCR service. Recognition may take time. Floorplan image requests also constitute automated access, so obtain Rightmove's written permission first.

## Data limitations

- Council Tax shows the property's band, not the annual amount payable. The amount varies by local authority and personal circumstances.
- The extension shows information only when it is explicitly provided in the listing and the extension can recognise it. **Not found** means the extension could not find a recognisable value; it does not prove that the listing lacks the information or that a charge is zero. **Ask agent** means the source explicitly says to ask the agent. Extraction may miss or misread information, so check it with the agent before making a decision.
- When a scan is started manually or automatic scanning is enabled, the extension attempts to recognise an explicitly labelled total area for the entire property, such as Gross Internal Floor Area. Results are marked **floorplan OCR**, are approximate, and must be checked against the floorplan. It does not calculate the area of individual rooms or read PDFs. If it cannot recognise the total area, it keeps the original status and indicates that no total area was read.
- OCR also supports labels such as Total area, Total floor area, Approx. floor area and Approx. area, as well as a standalone line containing Approx. followed by an area. The last form can be ambiguous, so always check it against the original image. The extension excludes areas near room or garden labels and tries not to guess when there are multiple candidates or conflicting values in different units.
- When a listing gives only square feet (sq ft), the extension keeps the original value and displays an approximate conversion to square metres (sq m). If the source gives both units, it keeps the original values without recalculating them.
- An undisclosed ground rent does not mean there is no charge. Confirm the amount and payment period with the original documents and your solicitor.
- Service charge is separate from ground rent. Both may be payable; confirm charges and the remaining lease term with the agent and your solicitor.
- **Details could not be loaded** may be caused by network problems, changes to the website, access restrictions or a withdrawn listing. If a request is blocked, stop using the extension and contact Rightmove after obtaining permission.
- The website's structure can change, so this local test version may need updates. Uninstall the extension to stop using it.

The current version can distinguish image download failures, OCR engine failures, no recognised text and no area found. If recognition fails, make a note of the specific message shown on the card. Always check the result against the original image.

## Testing status

This project is still a test version. OCR and area parsing have been tested with local images, and the recognition controls and task scheduling have been tested in a simulated environment. Full end-to-end testing of the Chrome extension with Rightmove has not yet been completed. Actual display and recognition results may vary with the website's structure and image quality.

## Third-party components

The extension includes local OCR components. See [ocr/THIRD-PARTY.md](ocr/THIRD-PARTY.md) for their sources, licences and checksums. The code authored for this repository does not currently have a separate open-source licence; the licences for the third-party components continue to apply.
