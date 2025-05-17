const fs = require('fs').promises;
const path = require('path');
const Handlebars = require('handlebars');

// --- Handlebars Helpers ---

Handlebars.registerHelper('formatDateRange', function(dateRange) {
  if (typeof dateRange === 'string') {
    return dateRange.replace('Present', new Date().getFullYear());
  }
  return dateRange;
});

// MODIFIED safeId: Expects an array of ID parts as the first argument.
// The 'options' argument is standard for Handlebars helpers but might be undefined if called directly from JS.
Handlebars.registerHelper('safeId', function(partsArray, options) {
  // console.log(`safeId_ENTER: typeof partsArray = ${typeof partsArray}, isArray = ${Array.isArray(partsArray)}`);
  // if (Array.isArray(partsArray)) {
  //   console.log(`safeId_ENTER: partsArray = [${partsArray.join(', ')}]`);
  // }


  if (!partsArray || !Array.isArray(partsArray) || partsArray.length === 0) {
    console.warn("safeId: partsArray is invalid or empty. Returning random default ID.");
    return `default-id-invalidargs-${Math.random().toString(36).substring(2, 9)}`;
  }

  // Filter out null, undefined, or effectively empty string parts from the provided array
  const validParts = partsArray.filter(part => part !== null && typeof part !== 'undefined' && String(part).trim() !== '');

  // console.log(`safeId_DEBUG: validParts after filter: [${validParts.join(', ')}] (length: ${validParts.length})`);

  if (validParts.length === 0) {
    console.warn("safeId: No valid parts after filter. Returning random default ID.");
    return `default-id-novalidparts-${Math.random().toString(36).substring(2, 9)}`;
  }

  let idString = validParts.join('-');
  // console.log(`safeId_DEBUG: Joined string: "${idString}"`);

  // Sanitize
  idString = idString.replace(/\s+/g, '-')
                     .replace(/[^a-zA-Z0-9-_]/g, '')
                     .toLowerCase();
  idString = idString.replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens

  if (idString === '') {
    console.warn(`safeId: Resulting ID is empty after sanitization. Original validParts: [${validParts.join(', ')}]. Using random default ID.`);
    return `default-id-empty-${Math.random().toString(36).substring(2, 9)}`;
  }
  // console.log(`safeId_RETURN: final idString: "${idString}"`);
  return idString;
});

Handlebars.registerHelper('eq', function(arg1, arg2) { return arg1 === arg2; });
Handlebars.registerHelper('lastUpdated', function() { return new Date().toISOString(); });

Handlebars.registerHelper('renderNestedItems', function(items, baseId, depth = 0, listClass = 'endpoints') {
  if (!items || !Array.isArray(items) || items.length === 0) {
    // console.log(`renderNestedItems: items is null, not an array, or empty. baseId="${baseId}", depth=${depth}. Returning empty string.`);
    return '';
  }

  // console.log(`RENDER_NESTED_ITEMS_ENTRY: baseId="${baseId}", depth=${depth}, num_items=${items.length}`);

  let html = `<ul class="${listClass}">`;
  items.forEach((itemData, itemIndex) => {
    // console.log(`  ITEM_LOOP_ENTRY: itemIndex=${itemIndex}, depth=${depth}, baseId="${baseId}", itemData.title="${itemData.title || '(string item)'}"`);
    // console.log(`    PRE_ID_PARTS: baseId="${baseId}", 'item', String(${depth}), String(${itemIndex})`);
    
    const idPartsArray = [baseId, 'item', String(depth), String(itemIndex)];
    const itemId = Handlebars.helpers.safeId(idPartsArray); // Call safeId with the array of parts

    console.log(`    CALCULATED_ITEM_ID: "${itemId}" (from parts: [${idPartsArray.join(', ')}]) for item titled "${itemData.title || '(string item)'}"`);

    html += '<li>';
    if (typeof itemData === 'string') {
      html += itemData;
    } else {
      const collapseId = `collapse-${itemId}`;
      const headingId = `heading-${itemId}`;

      html += `
        <div class="card">
          <div class="card-header" id="${headingId}">
            <h5 class="mb-0">
              <button class="btn btn-link" data-toggle="collapse" data-target="#${collapseId}" aria-expanded="false" aria-controls="${collapseId}">
                <span class="btn-icon">+</span>
                <span class="btn-icon-expanded">-</span>
                <span class="title-line">${itemData.title ? Handlebars.escapeExpression(itemData.title) : ''}</span>
              </button>
            </h5>
          </div>
          <div id="${collapseId}" class="collapse" aria-labelledby="${headingId}">
            <div class="card-body">
      `;
      if (itemData.description) {
        html += `<span class="description">${itemData.description}</span>`;
      }
      if (itemData.items && Array.isArray(itemData.items) && itemData.items.length > 0) {
        html += Handlebars.helpers.renderNestedItems(itemData.items, itemId, depth + 1, 'endpoints');
      }
      html += `
            </div>
          </div>
        </div>
      `;
    }
    html += '</li>';
  });
  html += '</ul>';
  return new Handlebars.SafeString(html);
});

// --- Main Generation Logic --- (Keep this as it was, with its own logs)
async function generateResume() {
  try {
    console.log('Starting resume generation...');
    const jsonDataPath = path.join(__dirname, 'resume_data.json');
    // console.log(`Attempting to read JSON data from: ${jsonDataPath}`);
    const jsonStr = await fs.readFile(jsonDataPath, 'utf-8');
    const data = JSON.parse(jsonStr);
    // console.log('Successfully read and parsed resume_data.json.');

    data.meta = data.meta || {};
    data.meta.lastUpdated = Handlebars.helpers.lastUpdated();
    // console.log(`Set meta.lastUpdated to: ${data.meta.lastUpdated}`);

    const templatePath = path.join(__dirname, 'template.hbs');
    // console.log(`Attempting to read Handlebars template from: ${templatePath}`);
    const templateStr = await fs.readFile(templatePath, 'utf-8');
    // console.log('Successfully read template.hbs.');

    // console.log('Compiling Handlebars template...');
    const compiledTemplate = Handlebars.compile(templateStr);
    // console.log('Template compiled successfully.');

    console.log('Rendering template with data...'); // Keep this one
    const outputHtml = compiledTemplate(data);
    console.log('HTML rendered successfully.'); // Keep this one

    const outputDir = path.join(__dirname, 'dist');
    // console.log(`Ensuring output directory exists: ${outputDir}`);
    await fs.mkdir(outputDir, { recursive: true });

    const cssSourcePath = path.join(__dirname, 'style.css');
    const cssDestPath = path.join(outputDir, 'style.css');
    // console.log(`Attempting to copy style.css from ${cssSourcePath} to ${cssDestPath}`);
    try {
      await fs.access(cssSourcePath);
      await fs.copyFile(cssSourcePath, cssDestPath);
      // console.log('style.css copied to dist/ successfully.');
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.warn('Warning: style.css not found in project root. It was not copied to dist/.');
      } else {
        console.error('Error copying style.css:', error);
      }
    }

    const outputPath = path.join(outputDir, 'index.html');
    // console.log(`Writing generated HTML to: ${outputPath}`);
    await fs.writeFile(outputPath, outputHtml);

    console.log('Resume generated successfully at dist/index.html!'); // Keep this one

  } catch (error) {
    console.error('FATAL ERROR during resume generation:', error);
    process.exitCode = 1;
  }
}

generateResume();
