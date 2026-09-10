(function () {
  var list = document.getElementById("sources-list");
  fetch("/api/sources")
    .then(function (res) { return res.json(); })
    .then(function (data) {
      var sources = (data && data.sources) || [];
      if (!sources.length) {
        list.innerHTML = '<p class="sources-loading">No sources available right now.</p>';
        return;
      }
      list.innerHTML = "";
      sources.forEach(function (s) {
        var row = document.createElement("div");
        row.className = "source-row";

        var link = document.createElement("a");
        link.href = s.url;
        link.target = "_blank";
        link.rel = "noopener";
        link.className = "source-row-org";
        link.textContent = s.org;

        var title = document.createElement("span");
        title.className = "source-row-title";
        title.textContent = s.title;

        row.appendChild(link);
        row.appendChild(title);
        list.appendChild(row);
      });
    })
    .catch(function () {
      list.innerHTML = '<p class="sources-loading">Couldn’t load the source list. Please try again later.</p>';
    });
})();
