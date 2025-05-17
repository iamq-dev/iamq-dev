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

// Helper to create safe, unique IDs for HTML elements
Handlebars.registerHelper('safeId', function(...args) {
  const parts = args.slice(0, -1); // Exclude Handlebars options object
  return parts.join('-')
    .replace(/\s+/g, '-') // Replace spaces with hyphens
    .replace(/[^a-zA-Z0-9-_]/g, '') // Remove invalid characters
    .toLowerCase() || 'default-id';
});

// Helper for basic equality check
Handlebars.registerHelper('eq', function(arg1, arg2) {
  return arg1 === arg2;
});

// Recursive helper to render nested items (like in Work Experience)
// Each item can be a string or an object with title, description, and further items
Handlebars.registerHelper('renderNestedItems', function(items, baseId, depth = 0, listClass = 'endpoints') {
  if (!items || items.length === 0) {
    return '';
  }

  let html = `<ul class="${listClass}">`;
  items.forEach((item, index) => {
    const itemId = Handlebars.helpers.safeId(baseId, 'item', depth, index);
    html += '<li>';
    if (typeof item === 'string') {
      html += `{{{item}}}`; // Use triple-stash for strings that might contain HTML
    } else { // It's an object, render as a card
      const collapseId = `collapse-${itemId}`;
      const headingId = `heading-${itemId}`;

      // aria-expanded will be set to false by default
      // data-parent helps manage accordion behavior; for deeply nested, it might be the immediate parent card's collapse div ID.
      // Your original HTML often used a general #accordion. We will make it point to the parent accordion section if possible,
      // or rely on the default Bootstrap behavior for nested collapses if a specific parent isn't easily determined or needed.
      // For now, we'll keep it simple and not add data-parent to deeply nested items unless clearly structured in JSON.

      html += `
        <div class="card"> <div class="card-header" id="${headingId}">
            <h5 class="mb-0">
              <button class="btn btn-link" data-toggle="collapse" data-target="#${collapseId}" aria-expanded="false" aria-controls="${collapseId}">
                <span class="btn-icon">+</span>
                <span class="btn-icon-expanded">-</span>
                <span class="title-line">${item.title}</span>
              </button>
            </h5>
          </div>
          <div id="${collapseId}" class="collapse" aria-labelledby="${headingId}">
            <div class="card-body">
      `;
      if (item.description) {
        // Triple stash for description, as it might contain HTML (like links)
        html += `<span class="description">{{{item.description}}}</span>`;
      }
      if (item.items && item.items.length > 0) {
        // Recursive call for sub-items.
        // Pass a more specific listClass if needed, e.g., 'no-bullets' based on your original HTML.
        html += Handlebars.helpers.renderNestedItems(item.items, itemId, depth + 1, 'endpoints'); // Or make listClass dynamic
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
    // 1. Read JSON data
    const jsonDataPath = path.join(__dirname, 'resume_data.json');
    const jsonStr = await fs.readFile(jsonDataPath, 'utf-8');
    const data = JSON.parse(jsonStr);

    // Optionally update the 'meta.lastUpdated' field in the data object before rendering
    data.meta = data.meta || {}; // Ensure meta object exists
    data.meta.lastUpdated = Handlebars.helpers.lastUpdated(); // Use helper to get current timestamp

    // 2. Read Handlebars template
    const templatePath = path.join(__dirname, 'template.hbs');
    const templateStr = await fs.readFile(templatePath, 'utf-8');

    // 3. Compile template
    const compiledTemplate = Handlebars.compile(templateStr);

    // 4. Render template with data
    const outputHtml = compiledTemplate(data);

    // 5. Write output to dist/index.html
    const outputDir = path.join(__dirname, 'dist');
    await fs.mkdir(outputDir, { recursive: true }); // Create dist directory if it doesn't exist

    // --- START:  copy style.css ---
    const cssSourcePath = path.join(__dirname, 'style.css');
    const cssDestPath = path.join(outputDir, 'style.css');

    try {
      await fs.access(cssSourcePath); // Check if source CSS file exists
      await fs.copyFile(cssSourcePath, cssDestPath);
      console.log('style.css copied to dist/');
    } catch (error) {
      // Handle cases where style.css might be missing in the root
      if (error.code === 'ENOENT') {
        // Log a warning but don't fail the build if style.css is optional or might not exist
        console.warn('Warning: style.css not found in project root. It will not be copied to dist/.');
        console.warn('If you have an external stylesheet, ensure it is named style.css and placed in the project root.');
      } else {
        // For other errors during copy, log them more critically
        console.error('Error copying style.css:', error);
        // Optionally, re-throw the error if CSS is critical and build should fail
        // throw error; 
      }
    }
    // --- END: copy style.css ---
    
    const outputPath = path.join(outputDir, 'index.html');
    await fs.writeFile(outputPath, outputHtml);

    console.log('Resume generated successfully at dist/index.html!');

  } catch (error) {
    console.error('Error generating resume:', error);
  }
}

generateResume();
