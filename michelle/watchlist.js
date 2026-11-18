const csvUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vT6NKhC-Idx4r1zNiKnAx-ByJkTRNh8hRWsiuL7BHiZQ_KqYuW98LQghdC0gDc4xQQdizWYDo5VGxIB/pub?gid=1124066259&single=true&output=csv";
const pageSize = 30;
const defaultColumns = new Set([
  "Watched",
  "Movie Title",
  "Michelle Name",
  "Genres",
  "Movie Vote Count",
  "Movie Release Date"
]);
const numericColumns = new Set([
  "Order",
  "Movie Vote Count",
  "Michelle Popularity",
  "Movie Popularity",
  "Movie Vote Average",
  "michelle ID",
  "Movie ID"
]);
const columnLabels = {
  "Watched": "Watched",
  "Movie Title": "Movie",
  "Michelle Name": "Michelle",
  "Genres": "Genres",
  "Order": "Order",
  "Movie Vote Count": "Reviews / votes",
  "Movie Release Date": "Release date",
  "Character": "Character",
  "Michelle Popularity": "Michelle popularity",
  "Movie Popularity": "Movie popularity",
  "Movie Vote Average": "Movie rating",
  "Original Language": "Language",
  "Overview": "Description",
  "michelle ID": "Michelle ID",
  "Movie ID": "Movie ID"
};
const sortOptions = {
  "reviews-desc": { column: "Movie Vote Count", direction: -1 },
  "reviews-asc": { column: "Movie Vote Count", direction: 1 },
  "release-desc": { column: "Movie Release Date", direction: -1 },
  "release-asc": { column: "Movie Release Date", direction: 1 }
};
const searchInput = document.querySelector("#movie-search");
const movieOptions = document.querySelector("#movie-options");
const statusSelect = document.querySelector("#watch-status");
const sortBySelect = document.querySelector("#sort-by");
const orderLimitInput = document.querySelector("#order-limit");
const minimumReviewsInput = document.querySelector("#minimum-reviews");
const genreFilter = document.querySelector("#genre-filter");
const michelleFilter = document.querySelector("#michelle-filter");
const michelleOptions = document.querySelector("#michelle-options");
const languageFilter = document.querySelector("#language-filter");
const summary = document.querySelector("#watchlist-summary");
const movieTable = document.querySelector(".movie-table");
const tableHeader = document.querySelector("#movie-table-header");
const tableBody = document.querySelector("#movie-table-body");
const pageStatus = document.querySelector("#watchlist-page-status");
const pageJumpForm = document.querySelector("#watchlist-page-form");
const pageJumpInput = document.querySelector("#watchlist-page-input");
const previousButton = document.querySelector("#watchlist-prev");
const nextButton = document.querySelector("#watchlist-next");
const columnOptions = document.querySelector("#column-options");
const resetColumnsButton = document.querySelector("#reset-columns");

let movies = [];
let sourceColumns = [];
let visibleColumns = new Set(defaultColumns);
let currentPage = 1;
let michelleSuggestions = [];

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  function finishField() {
    row.push(field);
    field = "";
  }

  function finishRow() {
    finishField();
    if (row.some(value => value !== "")) rows.push(row);
    row = [];
  }

  for (let i = 0; i < text.length; i += 1) {
    const character = text[i];
    if (quoted) {
      if (character === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"' && field === "") {
      quoted = true;
    } else if (character === ",") {
      finishField();
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && text[i + 1] === "\n") i += 1;
      finishRow();
    } else {
      field += character;
    }
  }

  if (field !== "" || row.length > 0) finishRow();
  return rows;
}

function makeMovieCell(movie, column, descriptionId) {
  const cell = document.createElement("td");
  const value = movie.values[column] || "";

  if (column === "Watched") {
    const badge = document.createElement("span");
    const watched = movie.watched;
    badge.className = `movie-status ${watched ? "is-watched" : "is-to-watch"}`;
    badge.textContent = watched ? "Watched" : "To watch";
    cell.append(badge);
  } else if (column === "Movie Title") {
    const title = document.createElement("button");
    title.type = "button";
    title.className = "movie-title";
    title.textContent = value || "Untitled";
    title.setAttribute("aria-expanded", "false");
    title.setAttribute("aria-controls", descriptionId);
    cell.append(title);
  } else {
    if (column === "Overview") cell.className = "overview-cell";
    if (numericColumns.has(column) && value !== "") {
      const number = Number(value);
      cell.textContent = Number.isFinite(number)
        ? number.toLocaleString(undefined, { maximumFractionDigits: 3 })
        : value;
    } else {
      cell.textContent = column === "Genres" ? value.replace(/\|/g, " · ") : value || "—";
    }
  }

  return cell;
}

function getVisibleColumns() {
  return sourceColumns.filter(column => visibleColumns.has(column));
}

function getOptionalNumber(input) {
  if (input.value.trim() === "") return null;
  const value = Number(input.value);
  return Number.isFinite(value) ? Math.max(0, value) : null;
}

function renderColumnOptions() {
  const fragment = document.createDocumentFragment();
  const legend = document.createElement("legend");
  legend.textContent = "Spreadsheet columns (keep at least one visible)";
  fragment.append(legend);

  sourceColumns.forEach((column, index) => {
    const label = document.createElement("label");
    label.className = "column-option";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = `movie-column-${index}`;
    checkbox.dataset.column = column;
    checkbox.checked = visibleColumns.has(column);
    checkbox.addEventListener("change", () => {
      if (!checkbox.checked && visibleColumns.size === 1) {
        checkbox.checked = true;
        return;
      }
      if (checkbox.checked) visibleColumns.add(column);
      else visibleColumns.delete(column);
      renderMovies();
    });

    const name = document.createElement("span");
    name.textContent = columnLabels[column] || column;
    label.append(checkbox, name);
    fragment.append(label);
  });

  columnOptions.replaceChildren(fragment);
}

function getUniqueFilterValues(values) {
  const options = new Map();
  values.forEach(value => {
    const label = value.trim();
    const normalized = label.toLocaleLowerCase();
    if (label && !options.has(normalized)) options.set(normalized, label);
  });
  return [...options.entries()]
    .sort((first, second) => first[1].localeCompare(second[1], undefined, { sensitivity: "base" }))
    .map(([value, label]) => ({ value, label }));
}

function populateFilterOptions(select, values, allLabel) {
  const fragment = document.createDocumentFragment();
  const allOptions = document.createElement("option");
  allOptions.value = "";
  allOptions.textContent = allLabel;
  fragment.append(allOptions);
  getUniqueFilterValues(values).forEach(({ value, label }) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    fragment.append(option);
  });
  select.replaceChildren(fragment);
}

function renderFilterOptions() {
  const genres = [];
  movies.forEach(movie => genres.push(...(movie.values.Genres || "").split("|")));
  populateFilterOptions(genreFilter, genres, "All genres");
  populateFilterOptions(languageFilter, movies.map(movie => movie.values["Original Language"]), "All languages");
  const michelleByName = new Map();
  movies.forEach(movie => {
    const name = (movie.values["Michelle Name"] || "").trim();
    const normalizedName = name.toLocaleLowerCase();
    if (!normalizedName) return;

    const popularityText = (movie.values["Michelle Popularity"] || "").trim();
    const parsedPopularity = popularityText ? Number(popularityText) : null;
    const popularity = parsedPopularity !== null && Number.isFinite(parsedPopularity)
      ? parsedPopularity
      : null;
    const existing = michelleByName.get(normalizedName);
    if (!existing || (popularity !== null && (existing.popularity === null || popularity > existing.popularity))) {
      michelleByName.set(normalizedName, { name, popularity });
    }
  });
  michelleSuggestions = [...michelleByName.values()].sort((first, second) => {
    if (first.popularity === null && second.popularity !== null) return 1;
    if (second.popularity === null && first.popularity !== null) return -1;
    return (second.popularity ?? 0) - (first.popularity ?? 0)
      || first.name.localeCompare(second.name, undefined, { sensitivity: "base" });
  });
  updateMichelleSuggestions();
}

function renderAutocompleteOptions(input, list, values) {
  const fragment = document.createDocumentFragment();
  values.forEach((value, index) => {
    const option = document.createElement("div");
    option.id = `${list.id}-option-${index}`;
    option.className = "watchlist-suggestion-option";
    option.setAttribute("role", "option");
    option.dataset.value = value;
    option.setAttribute("aria-selected", "false");
    option.textContent = value;
    fragment.append(option);
  });
  list.replaceChildren(fragment);
  const expanded = document.activeElement === input && values.length > 0;
  const inputBounds = input.getBoundingClientRect();
  const spaceBelow = window.innerHeight - inputBounds.bottom;
  const spaceAbove = inputBounds.top;
  list.classList.toggle("opens-up", expanded && spaceBelow < 230 && spaceAbove > spaceBelow);
  list.hidden = !expanded;
  input.setAttribute("aria-expanded", String(expanded));
}

function updateMichelleSuggestions() {
  const query = michelleFilter.value.trim().toLocaleLowerCase();
  const suggestions = michelleSuggestions
    .filter(({ name }) => !query || name.toLocaleLowerCase().includes(query))
    .slice(0, query ? 50 : 10)
    .map(({ name }) => name);
  renderAutocompleteOptions(michelleFilter, michelleOptions, suggestions);
}

function updateMovieSuggestions(filteredMovies) {
  const query = searchInput.value.trim().toLocaleLowerCase();
  const titles = new Map();
  filteredMovies.forEach(movie => {
    const title = (movie.values["Movie Title"] || "").trim();
    const normalizedTitle = title.toLocaleLowerCase();
    if (title && !titles.has(normalizedTitle)) titles.set(normalizedTitle, title);
  });

  renderAutocompleteOptions(searchInput, movieOptions, [...titles.values()].slice(0, query ? 50 : 10));
}

function setupAutocomplete(input, list, refreshSuggestions) {
  let activeOptionIndex = -1;
  const getOptions = () => [...list.querySelectorAll('[role="option"]')];

  function closeSuggestions() {
    activeOptionIndex = -1;
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
  }

  function setActiveOption(index) {
    const options = getOptions();
    activeOptionIndex = index;
    options.forEach((option, optionIndex) => {
      option.setAttribute("aria-selected", String(optionIndex === activeOptionIndex));
    });
    const activeOption = options[activeOptionIndex];
    if (activeOption) {
      input.setAttribute("aria-activedescendant", activeOption.id);
      activeOption.scrollIntoView({ block: "nearest" });
    } else {
      input.removeAttribute("aria-activedescendant");
    }
  }

  function selectOption(option) {
    input.value = option.dataset.value || "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    closeSuggestions();
  }

  input.addEventListener("focus", () => {
    activeOptionIndex = -1;
    refreshSuggestions();
  });
  input.addEventListener("blur", closeSuggestions);
  input.addEventListener("input", () => {
    activeOptionIndex = -1;
    input.removeAttribute("aria-activedescendant");
  });
  input.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      closeSuggestions();
      return;
    }
    if (event.key === "Enter" && !list.hidden && activeOptionIndex >= 0) {
      event.preventDefault();
      const activeOption = getOptions()[activeOptionIndex];
      if (activeOption) selectOption(activeOption);
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;

    refreshSuggestions();
    const options = getOptions();
    if (options.length === 0) return;

    event.preventDefault();
    const direction = event.key === "ArrowDown" ? 1 : -1;
    const nextIndex = activeOptionIndex < 0
      ? (direction === 1 ? 0 : options.length - 1)
      : (activeOptionIndex + direction + options.length) % options.length;
    setActiveOption(nextIndex);
  });
  list.addEventListener("mousedown", event => event.preventDefault());
  list.addEventListener("click", event => {
    if (!(event.target instanceof Element)) return;
    const option = event.target.closest('[role="option"]');
    if (!option || !list.contains(option)) return;
    selectOption(option);
  });
}

function renderTableHeader() {
  const fragment = document.createDocumentFragment();
  const sort = sortOptions[sortBySelect.value];
  getVisibleColumns().forEach(column => {
    const header = document.createElement("th");
    header.scope = "col";
    header.textContent = columnLabels[column] || column;
    if (column === sort.column) {
      header.setAttribute("aria-sort", sort.direction === 1 ? "ascending" : "descending");
      const indicator = document.createElement("span");
      indicator.className = "sort-indicator";
      indicator.setAttribute("aria-hidden", "true");
      indicator.textContent = sort.direction === 1 ? " ↑" : " ↓";
      header.append(indicator);
    }
    fragment.append(header);
  });
  tableHeader.replaceChildren(fragment);
}

function resetMovieTableColumnWidths() {
  movieTable.style.tableLayout = "auto";
  movieTable.querySelector("colgroup")?.remove();
}

function lockMovieTableColumnWidths() {
  if (movieTable.querySelector("colgroup")) return;

  const firstMovieRow = tableBody.querySelector(".movie-row");
  if (!firstMovieRow) return;

  const tableWidth = movieTable.getBoundingClientRect().width;
  const columnWidths = [...firstMovieRow.cells].map(cell => cell.getBoundingClientRect().width);
  const columnGroup = document.createElement("colgroup");
  columnWidths.forEach(width => {
    const column = document.createElement("col");
    column.style.width = `${width / tableWidth * 100}%`;
    columnGroup.append(column);
  });
  movieTable.insertBefore(columnGroup, movieTable.firstChild);
  movieTable.style.tableLayout = "fixed";
}

function getMovieSortValue(movie, column) {
  const value = (movie.values[column] || "").trim();
  if (!value) return null;

  if (column === "Movie Release Date") {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function getFilteredMovies() {
  const query = searchInput.value.trim().toLocaleLowerCase();
  const filter = statusSelect.value;
  const selectedGenre = genreFilter.value;
  const selectedMichelle = michelleFilter.value.trim().toLocaleLowerCase();
  const selectedLanguage = languageFilter.value;
  const maximumOrder = getOptionalNumber(orderLimitInput);
  const minimumReviews = getOptionalNumber(minimumReviewsInput);
  const filteredMovies = movies.filter(movie => {
    if (filter === "watched" && !movie.watched) return false;
    if (filter === "unwatched" && movie.watched) return false;
    if (selectedGenre && !(movie.values.Genres || "").split("|").some(genre => genre.trim().toLocaleLowerCase() === selectedGenre)) return false;
    if (selectedMichelle && !(movie.values["Michelle Name"] || "").toLocaleLowerCase().includes(selectedMichelle)) return false;
    if (selectedLanguage && (movie.values["Original Language"] || "").trim().toLocaleLowerCase() !== selectedLanguage) return false;
    const orderText = movie.values.Order || "";
    const order = Number(orderText);
    if (maximumOrder !== null && (orderText.trim() === "" || !Number.isFinite(order) || order > maximumOrder)) return false;
    const reviewCount = Number(movie.values["Movie Vote Count"]) || 0;
    if (minimumReviews !== null && reviewCount < minimumReviews) return false;
    return !query || (movie.values["Movie Title"] || "").toLocaleLowerCase().includes(query);
  });

  const sort = sortOptions[sortBySelect.value];
  return filteredMovies.sort((first, second) => {
    const firstValue = getMovieSortValue(first, sort.column);
    const secondValue = getMovieSortValue(second, sort.column);
    if (firstValue === null && secondValue !== null) return 1;
    if (secondValue === null && firstValue !== null) return -1;
    if (firstValue !== null && secondValue !== null) {
      const difference = (firstValue - secondValue) * sort.direction;
      if (difference !== 0) return difference;
    }
    return first.values["Movie Title"].localeCompare(second.values["Movie Title"], undefined, { sensitivity: "base" });
  });
}

function renderMovies() {
  resetMovieTableColumnWidths();
  const filteredMovies = getFilteredMovies();
  updateMovieSuggestions(filteredMovies);
  const pageCount = Math.max(1, Math.ceil(filteredMovies.length / pageSize));
  currentPage = Math.min(currentPage, pageCount);
  pageJumpInput.max = String(pageCount);
  pageJumpInput.value = String(currentPage);

  renderTableHeader();
  const startIndex = (currentPage - 1) * pageSize;
  const pageMovies = filteredMovies.slice(startIndex, startIndex + pageSize);
  const fragment = document.createDocumentFragment();

  if (pageMovies.length === 0) {
    const row = document.createElement("tr");
    const cell = document.createElement("td");
    cell.className = "movie-table-empty";
    cell.colSpan = Math.max(1, getVisibleColumns().length);
    cell.textContent = "No movies match. Try another search or filter.";
    row.append(cell);
    fragment.append(row);
  } else {
    pageMovies.forEach((movie, index) => {
      const row = document.createElement("tr");
      row.className = "movie-row";
      const descriptionId = `movie-description-${startIndex + index}`;
      const visibleColumns = getVisibleColumns();
      visibleColumns.forEach(column => row.append(makeMovieCell(movie, column, descriptionId)));

      const descriptionRow = document.createElement("tr");
      descriptionRow.id = descriptionId;
      descriptionRow.className = "movie-description-row";
      descriptionRow.hidden = true;
      const titleColumnIndex = Math.max(0, visibleColumns.indexOf("Movie Title"));
      if (titleColumnIndex > 0) {
        const spacer = document.createElement("td");
        spacer.className = "movie-description-spacer";
        spacer.colSpan = titleColumnIndex;
        descriptionRow.append(spacer);
      }
      const descriptionCell = document.createElement("td");
      descriptionCell.className = "movie-description-cell";
      descriptionCell.colSpan = visibleColumns.length - titleColumnIndex;
      const overview = document.createElement("p");
      overview.textContent = movie.values.Overview || "No description available.";
      descriptionCell.append(overview);
      descriptionRow.append(descriptionCell);

      fragment.append(row, descriptionRow);
    });
  }

  tableBody.replaceChildren(fragment);
  const firstResult = filteredMovies.length ? startIndex + 1 : 0;
  const lastResult = Math.min(startIndex + pageSize, filteredMovies.length);
  pageStatus.textContent = `Showing ${firstResult.toLocaleString()}–${lastResult.toLocaleString()} of ${filteredMovies.length.toLocaleString()} · page ${currentPage} of ${pageCount}`;
  previousButton.disabled = currentPage <= 1;
  nextButton.disabled = currentPage >= pageCount;
}

function showLoadError(error) {
  console.error("Could not load the Michelle movie list from Google Sheets.", error);
  summary.setAttribute("role", "alert");
  summary.textContent = "The live movie list could not be loaded. Try again later or open the original spreadsheet.";
  const row = document.createElement("tr");
  const cell = document.createElement("td");
  cell.className = "movie-table-empty";
  cell.colSpan = Math.max(1, getVisibleColumns().length);
  cell.textContent = "The spreadsheet data is unavailable right now.";
  row.append(cell);
  tableBody.replaceChildren(row);
  pageStatus.textContent = "List unavailable";
}

async function loadMovies() {
  const response = await fetch(csvUrl, { cache: "no-store" });
  if (!response.ok) throw new Error(`Google Sheets returned HTTP ${response.status}.`);

  const csvText = (await response.text()).replace(/^\uFEFF/, "");
  const rows = parseCsv(csvText);
  const headers = rows.shift();
  if (!headers) throw new Error("The published spreadsheet is empty.");

  sourceColumns = headers.map(header => header.trim());
  const requiredColumns = [
    "Watched",
    "Movie Title",
    "Michelle Name",
    "Michelle Popularity",
    "Genres",
    "Original Language",
    "Order",
    "Movie Vote Count",
    "Movie Release Date",
    "Overview"
  ];
  const missingColumn = requiredColumns.find(name => !sourceColumns.includes(name));
  if (missingColumn) throw new Error(`The published spreadsheet is missing the "${missingColumn}" column.`);

  movies = rows.map(row => {
    const values = Object.fromEntries(sourceColumns.map((column, index) => [column, row[index] || ""]));
    return {
      values,
      watched: (values.Watched || "").trim().toLowerCase() === "true"
    };
  }).filter(movie => movie.values["Movie Title"].trim() !== "");

  if (movies.length === 0) throw new Error("The published spreadsheet contains no movie rows.");

  visibleColumns = new Set([...defaultColumns].filter(column => sourceColumns.includes(column)));
  renderColumnOptions();
  renderFilterOptions();

  const watchedCount = movies.reduce((count, movie) => count + Number(movie.watched), 0);
  summary.textContent = `${movies.length.toLocaleString()} movies · ${watchedCount.toLocaleString()} watched`;
  renderMovies();
}

searchInput.addEventListener("input", () => {
  currentPage = 1;
  renderMovies();
});
statusSelect.addEventListener("change", () => {
  currentPage = 1;
  renderMovies();
});
sortBySelect.addEventListener("change", () => {
  currentPage = 1;
  renderMovies();
});
for (const filter of [genreFilter, languageFilter]) {
  filter.addEventListener("change", () => {
    currentPage = 1;
    renderMovies();
  });
}
michelleFilter.addEventListener("input", () => {
  updateMichelleSuggestions();
  currentPage = 1;
  renderMovies();
});
orderLimitInput.addEventListener("input", () => {
  currentPage = 1;
  renderMovies();
});
minimumReviewsInput.addEventListener("input", () => {
  currentPage = 1;
  renderMovies();
});
previousButton.addEventListener("click", () => {
  currentPage -= 1;
  renderMovies();
});
nextButton.addEventListener("click", () => {
  currentPage += 1;
  renderMovies();
});
pageJumpForm.addEventListener("submit", event => {
  event.preventDefault();
  currentPage = Number(pageJumpInput.value);
  renderMovies();
});
resetColumnsButton.addEventListener("click", () => {
  visibleColumns = new Set([...defaultColumns].filter(column => sourceColumns.includes(column)));
  columnOptions.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
    checkbox.checked = visibleColumns.has(checkbox.dataset.column);
  });
  renderMovies();
});
setupAutocomplete(searchInput, movieOptions, () => updateMovieSuggestions(getFilteredMovies()));
setupAutocomplete(michelleFilter, michelleOptions, updateMichelleSuggestions);
tableBody.addEventListener("click", event => {
  const target = event.target;
  if (!(target instanceof Element)) return;

  const row = target.closest("tr.movie-row");
  if (!row) return;
  const descriptionRow = row.nextElementSibling;
  if (!descriptionRow?.classList.contains("movie-description-row")) return;

  if (descriptionRow.hidden) lockMovieTableColumnWidths();
  descriptionRow.hidden = !descriptionRow.hidden;
  row.querySelector(".movie-title")?.setAttribute("aria-expanded", String(!descriptionRow.hidden));
});

loadMovies().catch(showLoadError);
