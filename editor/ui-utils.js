
(function(global) {
  if (!global.loadScriptOnce) {
    global.loadScriptOnce = function (url) {
        return new Promise((resolve, reject) => {
            // If script is already present
            if (document.querySelector(`script[src="${url}"]`)) {
                // Check if it's already loaded
                if (typeof $.fn.multiselect === "function") {
                    resolve();
                } else {
                    // Wait until plugin registers (poll)
                    const wait = setInterval(() => {
                        if (typeof $.fn.multiselect === "function") {
                        clearInterval(wait);
                        resolve();
                        }
                    }, 25);
                }
                return;
            }

            // If not yet loaded, inject it. We do this dynamically as the x-red scripts are templates and can't use variables 
            // (in our case containing the static content URL) directly.
            const script = document.createElement("script");
            script.src = url;
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    };
  }

})(window);


function buildAdminStaticPath(path) {
  return "openhab4/editor/" + path;
}

function openhabEditPrepare(node, allowEmpty) {
  function updateOpenhabItemSelection(cntrlConfig, itemName) {
    const $el = $("#node-input-itemname");

    $el.multiselect({
      enableFiltering: true,
      enableCaseInsensitiveFiltering: true,
      maxHeight: 300,
      disableIfEmpty: true,
      nonSelectedText: "Select item...",
      disabledText: "No items found..."
    });

    if (cntrlConfig) {
      const config = {
        name: cntrlConfig.name,
        protocol: cntrlConfig.protocol,
        host: cntrlConfig.host,
        port: cntrlConfig.port,
        path: cntrlConfig.path,
        username: cntrlConfig.username,
        password: cntrlConfig.password
      };

      $.getJSON("openhab4/items", config)
        .done(function (items) {
          $el.children().remove();
          items.sort((a, b) => a.name.localeCompare(b.name));

          if (allowEmpty) {
            $el.append('<option value="">[No item]</option>');
          }

          items.forEach(function (item) {
            $el.append($("<option>").text(item.name).val(item.name));
          });

          $el.val(itemName);
          $el.multiselect("rebuild");
        })
        .fail(function (xhr, status, error) {
          console.warn("Item load failed:", { error, status, xhr });
          $el.empty().append(
            $("<option>")
              .text("⚠️ Failed to load items: " + error)
              .attr("disabled", true)
          );
        });
    }
  }

  // Load the multiselect script if needed
  loadScriptOnce(buildAdminStaticPath("js/bootstrap-multiselect.js")).then(() => {
    updateOpenhabItemSelection(RED.nodes.node(node.controller), node.itemname);

    $("#node-input-controller").change(function () {
      const controllerId = $("#node-input-controller").val();
      const current = $("#node-input-itemname").val() || node.itemname;
      updateOpenhabItemSelection(RED.nodes.node(controllerId), current);
    });
  });
}

window.openhabEditPrepare = openhabEditPrepare;

