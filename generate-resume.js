const fs = require('fs').promises;
const path = require('path');
const Handlebars = require('handlebars');

// --- Handlebars Helpers ---

// Helper to format date ranges (e.g., "Present" -> current year)
Handlebars.registerHelper('formatDateRange', function(dateRange) {
  if (typeof dateRange === 'string') {
    return dateRange.replace('Present', new Date().getFullYear());
  }
  return dateRange;
});

// More robust safeId helper with logging for debugging
Handlebars.registerHelper('safeId', function(...args) {
  const options = args.pop(); // Handlebars options object always last
  // Filter out null, undefined, or effectively empty string parts
  const parts = args.filter(part => part !== null && typeof part !== 'undefined' && part.toString().trim() !== '');

  if (parts.length === 0) {
    console.warn("safeId CALLED WITH NO VALID PARTS, returning 'default-id-random'");
    return `default-id-${Math.random().toString(36).substring(2, 7)}`; // Ensure some uniqueness
  }

  let idString = parts.join('-');
  idString = idString.replace(/\s+/g, '-') // Replace spaces with hyphens
                     .replace(/[^a-zA-Z0-9-_]/g, '') // Remove invalid characters
                     .toLowerCase();

  // Remove leading/trailing hyphens that might result from empty parts or stripping
  idString = idString.replace(/^-+|-+$/g, '');

  if (idString === '') {
    console.warn(`safeId: Resulting ID string is empty after processing parts: [${args.join(', ')}]. Using random fallback.`);
    return `default-id-empty-${Math.random().toString(36).substring(2, 7)}`;
  }
  // console.log(`safeId: input parts [${args.join(', ')}] -> output '${idString}'`); // Optional: log successful ID generations
  return idString;
});

// Helper for basic equality check
Handlebars.registerHelper('eq', function(arg1, arg2) {
  return arg1 === arg2;
});

// Recursive helper to render nested items with extensive logging for debugging ID issues
Handlebars.registerHelper('renderNestedItems', function(items, baseId, depth = 0, listClass = 'endpoints') {
  if (!items || items.length === 0) {
    return '';
  }

  // Logging the entry of this function call
  // console.log(`renderNestedItems CALLED: baseId='${baseId}', depth=${depth}, items.length=${items.length}, listClass='${listClass}'`);

  let html = `<ul class="${listClass}">`;
  items.forEach((itemData, itemIndex) => { // itemIndex is crucial
    // Log for each item in the loop
    // console.log(`  LOOPING in renderNestedItems: itemIndex=${itemIndex}, current baseId='${baseId}', depth=${depth}, itemData.title='${itemData.title || 'N/A (string item)'}'`);

    // Construct a literal part of the ID that includes depth and index to ensure uniqueness
    const idLiteralSegment = `d${depth}-i${itemIndex}`;
    const itemId = Handlebars.helpers.safeId(baseId, idLiteralSegment); // Pass combined literal

    // Log the generated itemId and its components
    console.log(`    GENERATED itemId for renderNestedItems: '${itemId}' (components: baseId='${baseId}', literalSegment='${idLiteralSegment}')`);

    html += '<li>';
    if (typeof itemData === 'string') {
      html += itemData; // Assuming itemData string can contain HTML and should be rendered as is
    } else { // It's an object, render as a card
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
        html += `<span class="description">${itemData.description}</span>`; // Assuming description can contain HTML
      }
      if (itemData.items && itemData.items.length > 0) {
        // Recursive call: baseId for children is the current unique itemId. Depth is incremented.
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

// Helper to generate the last updated timestamp
Handlebars.registerHelper('lastUpdated', function() {
  return new Date().toISOString();
});


// --- Main Generation Logic ---
async function generateResume() {
  try {
    console.log('Starting resume generation...');
    // 1. Read JSON data
    const jsonDataPath = path.join(__dirname, 'resume_data.json');
    console.log(`Attempting to read JSON data from: ${jsonDataPath}`);
    const jsonStr = await fs.readFile(jsonDataPath, 'utf-8');
    const data = JSON.parse(jsonStr);
    console.log('Successfully read and parsed resume_data.json.');

    // Optionally update the 'meta.lastUpdated' field in the data object before rendering
    data.meta = data.meta || {}; // Ensure meta object exists
    data.meta.lastUpdated = Handlebars.helpers.lastUpdated();
    console.log(`Set meta.lastUpdated to: ${data.meta.lastUpdated}`);

    // 2. Read Handlebars template
    const templatePath = path.join(__dirname, 'template.hbs');
    console.log(`Attempting to read Handlebars template from: ${templatePath}`);
    const templateStr = await fs.readFile(templatePath, 'utf-8');
    console.log('Successfully read template.hbs.');

    // 3. Compile template
    console.log('Compiling Handlebars template...');
    const compiledTemplate = Handlebars.compile(templateStr);
    console.log('Template compiled successfully.');

    // 4. Render template with data
    console.log('Rendering template with data...');
    const outputHtml = compiledTemplate(data);
    console.log('HTML rendered successfully.');

    // 5. Prepare output directory and copy CSS
    const outputDir = path.join(__dirname, 'dist');
    console.log(`Ensuring output directory exists: ${outputDir}`);
    await fs.mkdir(outputDir, { recursive: true });

    const cssSourcePath = path.join(__dirname, 'style.css');
    const cssDestPath = path.join(outputDir, 'style.css');
    console.log(`Attempting to copy style.css from ${cssSourcePath} to ${cssDestPath}`);
    try {
      await fs.access(cssSourcePath);
      await fs.copyFile(cssSourcePath, cssDestPath);
      console.log('style.css copied to dist/ successfully.');
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.warn('Warning: style.css not found in project root. It was not copied to dist/.');
      } else {
        console.error('Error copying style.css:', error);
        // Decide if this should be a fatal error: throw error;
      }
    }

    // 6. Write output HTML
    const outputPath = path.join(outputDir, 'index.html');
    console.log(`Writing generated HTML to: ${outputPath}`);
    await fs.writeFile(outputPath, outputHtml);

    console.log('Resume generated successfully at dist/index.html!');

  } catch (error) {
    console.error('FATAL ERROR during resume generation:', error);
    process.exitCode = 1; // Indicate an error exit code
  }
}

generateResume();
