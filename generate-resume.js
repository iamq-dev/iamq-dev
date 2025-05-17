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

// REVISED safeId helper to correctly handle calls from templates and from JS
Handlebars.registerHelper('safeId', function(...inputArgs) {
  // The last argument Handlebars passes is the options object
  const options = inputArgs.pop(); 
  let parts;

  // If called from JS with a single array as the first argument (e.g., safeId(myArrayParts))
  // inputArgs would be [myArrayParts] (after options was popped)
  if (inputArgs.length === 1 && Array.isArray(inputArgs[0])) {
    parts = inputArgs[0];
    // console.log(`safeId_DEBUG: Called from JS with pre-formed array: [${parts.map(String).join(', ')}]`);
  } else {
    // Called from template with multiple arguments (e.g., {{safeId 'val1' 'val2' @index}})
    // inputArgs now holds these individual arguments.
    parts = inputArgs;
    // console.log(`safeId_DEBUG: Called from template with individual args: [${parts.map(String).join(', ')}]`);
  }

  if (!parts || !Array.isArray(parts) || parts.length === 0) {
    console.warn("safeId: Effective 'parts' array is invalid or empty after processing input. Returning random default ID.");
    return `default-id-parts-empty-${Math.random().toString(36).substring(2, 9)}`;
  }

  const validParts = parts.filter(part => part !== null && typeof part !== 'undefined' && String(part).trim() !== '');
  // console.log(`safeId_DEBUG: validParts after filter: [${validParts.join(', ')}] (length: ${validParts.length})`);

  if (validParts.length === 0) {
    console.warn("safeId: No valid parts after filter. Base parts were: [${parts.join(', ')}]. Returning random default ID.");
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
    console.warn(`safeId: Resulting ID is empty after sanitization. Valid parts for join were: [${validParts.join(', ')}]. Using random default ID.`);
    return `default-id-empty-${Math.random().toString(36).substring(2, 9)}`;
  }
  // console.log(`safeId_RETURN: final idString: "${idString}"`);
  return idString;
});

Handlebars.registerHelper('eq', function(arg1, arg2) { return arg1 === arg2; });
Handlebars.registerHelper('lastUpdated', function() { return new Date().toISOString(); });

Handlebars.registerHelper('renderNestedItems', function(items, baseId, depth = 0, listClass = 'endpoints') {
  if (!items || !Array.isArray(items) || items.length === 0) {
    return '';
  }
  // console.log(`RENDER_NESTED_ITEMS_ENTRY: baseId="${baseId}", depth=${depth}, num_items=${items.length}`);

  let html = `<ul class="${listClass}">`;
  items.forEach((itemData, itemIndex) => {
    // console.log(`  ITEM_LOOP_ENTRY: itemIndex=${itemIndex}, depth=${depth}, baseId="${baseId}", itemData.title="${itemData.title || '(string item)'}"`);
    
    const idPartsArray = [baseId, 'item', String(depth), String(itemIndex)];
    // Call safeId with the array of parts. Our new safeId will detect this.
    const itemId = Handlebars.helpers.safeId(idPartsArray); 

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

// --- Main Generation Logic --- (trimmed console logs for brevity, keep important ones)
async function generateResume() {
  try {
    console.log('Starting resume generation...');
    const jsonDataPath = path.join(__dirname, 'resume_data.json');
    const jsonStr = await fs.readFile(jsonDataPath, 'utf-8');
    const data = JSON.parse(jsonStr);

    data.meta = data.meta || {};
    data.meta.lastUpdated = Handlebars.helpers.lastUpdated();

    const templatePath = path.join(__dirname, 'template.hbs');
    const templateStr = await fs.readFile(templatePath, 'utf-8');

    const compiledTemplate = Handlebars.compile(templateStr);

    console.log('Rendering template with data...');
    const outputHtml = compiledTemplate(data);
    console.log('HTML rendered successfully.');

    const outputDir = path.join(__dirname, 'dist');
    await fs.mkdir(outputDir, { recursive: true });

    const cssSourcePath = path.join(__dirname, 'style.css');
    const cssDestPath = path.join(outputDir, 'style.css');
    try {
      await fs.access(cssSourcePath);
      await fs.copyFile(cssSourcePath, cssDestPath);
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.warn('Warning: style.css not found in project root. It was not copied to dist/.');
      } else {
        console.error('Error copying style.css:', error);
      }
    }

    const outputPath = path.join(outputDir, 'index.html');
    await fs.writeFile(outputPath, outputHtml);

    console.log('Resume generated successfully at dist/index.html!');

  } catch (error) {
    console.error('FATAL ERROR during resume generation:', error);
    process.exitCode = 1;
  }
}

generateResume();
