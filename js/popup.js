(function(){ "use strict";

/*** utils ***/
var utils = {
	view: function(name){
		$("body").children().hide();
		$("#" + name).show();
	},
	confirm: function(html, index){
		var yes = $("#confirm-text").html(html).siblings().children().eq(0).attr("data-actionindex", typeof index === "number" ? index : 1);
		utils.view("confirm");
		yes.focus();
	},
	action: function(name, index){
		state.action = name || state.action;
		actions[state.action][index || 0](state.name);
		sessions.load();
	},
	escape: function(text){
		return $("<div/>").text(text).html();
	},
	tabs: function(cb){
		chrome.tabs.getAllInWindow(null, function(tabs){
			if (localStorage.pinned === "skip") {
				tabs = tabs.filter(function(t){ return !t.pinned; });
			}
			
			cb(tabs.map(function(t){ return t.url; }));
			sessions.load();
		});
	}
};


/*** data ***/
var background = chrome.extension.getBackgroundPage();

var state = {
	name: "",
	action: "",
	id: "",
	entered: ""
};

var sessions = {
	list: JSON.parse(localStorage.sessions),
	temp: localStorage.temp ? JSON.parse(localStorage.temp) : undefined,
	
	load: function(){
		var $temp = $("#main-saved-temp"), $list = $("#main-saved-list"), $main = $("#main-saved");
		$temp.add($list).empty();
		
		if (sessions.temp) {
			localStorage.temp = JSON.stringify(sessions.temp);
			$temp.html("<a>&times;</a> Temp session: " + sessions.display(null, true) + " - <a>Open</a> - <a>Add</a> (<a>tab</a>)<hr>");
		} else {
			delete localStorage.temp;
		}
		
		localStorage.sessions = JSON.stringify(sessions.list);
		$.each(sessions.list, function(name){
			$("<div/>").html("<big>" + utils.escape(name) + "</big><a>&times;</a><br>" +
				sessions.display(name, true) +
				"<span><a>Open</a> - <a>Add</a> (<a>tab</a>) - <a>Replace</a></span>" +
			"<br><hr>").attr("data-name", name).appendTo($list);
		});
		
		$("hr", "#main-saved").last().remove();
		
		if(Object.keys(sessions.list).length > 10) $main.addClass("scroll");
                else $main.removeClass("scroll");
	},
	display: function(name, count){
		var prefix = "", session = name === null ? (name = "temp session", !count && (prefix = "the "), sessions.temp) : sessions.list[name];
		return prefix + '<a title="' + session.join("\n") + '">' + (count ? session.length + " tabs" : utils.escape(name)) + '</a>';
	}
};


/*** actions ***/
var actions = {
	import: [function(){
		var reader = new FileReader();
		
		reader.onload = function(e){
			try {
				$.each(JSON.parse(e.target.result), function(name, urls){
					sessions.list[name] = urls;
				});
				
				state.entered = "Success";
			} catch (e) {
				state.entered = "ParseError";
			}
			
			utils.action("import", 1);
		};
		
		reader.onerror = function(){
			state.entered = "FileError";
			utils.action("import", 1);
		};
		
		reader.readAsText($("#import-file")[0].files[0]);
	}, function(){
		var status = state.entered,
			success = status === "Success",
			message = $("#import-message").text(success ? "Success!" : "Import failed!").delay(500).slideDown();
		
		success && message.delay(1500).queue(function(next){
			location.search ? window.close() : utils.view("main");
			message.hide();
			next();
		});
		
		background._gaq.push(["_trackEvent", "Action", "Import", state.entered]);
	}],
	
	export: [function(){
		var data = new Blob([localStorage.sessions]);
		
		$("#export-link").prop("href", (window.URL || window.webkitURL).createObjectURL(data));
	}, function(){
		$("#export-check").fadeIn().delay(2000).fadeOut();
		
		background._gaq.push(["_trackEvent", "Action", "Export"]);
	}],
	
	rename: [function(name){
		$("#rename-legend").html("Rename " + sessions.display(name));
		utils.view("rename");
		$("#rename-text").val("").focus();
	}, function(oname){
		var nname = state.entered = $("#rename-text").val().trim();
		
		if (nname) {
			if (sessions.list[nname]) {
				utils.confirm("Are you sure you want to replace " + sessions.display(nname) + " by renaming " + sessions.display(oname) + "?", 2);
			} else {
				utils.action("rename", 2);
				utils.view("main");
			}
		}
	}, function(oname){
		sessions.list[state.entered] = sessions.list[oname];
		
		if (state.entered !== oname) {
			delete sessions.list[oname];
		}
		
		background._gaq.push(["_trackEvent", "Session", "Rename"]);
	}],
	
	add: [function(name){
		utils.confirm("Are you sure you want to add the current window's tabs to " + sessions.display(name) + "?");
	}, function(name){
		utils.tabs(function(tabs){
			Array.prototype.push.apply(name === null ? sessions.temp : sessions.list[name], tabs);
		});
		
		background._gaq.push(["_trackEvent", name === null ? "Temp": "Session", "AddWin"]);
	}],
	
	tab: [function(name){
		utils.confirm("Are you sure you want to add the current tab to " + sessions.display(name) + "?");
	}, function(name){
		chrome.tabs.getSelected(null, function(tab){
			(name === null ? sessions.temp : sessions.list[name]).push(tab.url);
			sessions.load();
		});
		
		background._gaq.push(["_trackEvent", name === null ? "Temp": "Session", "AddTab"]);
	}],
	
	replace: [function(name){
		utils.confirm("Are you sure you want to replace " + sessions.display(name) + " with the current window's tabs?");
	}, function(name){
		background._gaq.push(["_trackEvent", "Session", sessions.list[name] ? "Replace" : "Save"]);
		
		utils.tabs(function(tabs){
			sessions.list[name] = tabs;
		});
	}, function(name){
		utils.confirm("Are you sure you want to replace " + sessions.display(name) + " with the session being saved?");
	}],
	
	edit: [function(name){
		$("#edit-legend").html("Edit " + utils.escape(name));

		
                var $list = $("#edit-saved-session"), $main = $("#edit-saved");
		
		$list.html("");
                $list.attr("data-name", name)
		$.each(sessions.list[name], function(n){
                        console.log(sessions.list[name][n]);
                        var $url = utils.escape(sessions.list[name][n]);
			$("<div/>").html("<big><a title=\"" + $url + "\">" + $url + "</a></big><a>&times;</a><hr>").attr("data-name", sessions.list[name][n]).appendTo($list);
		});
		
		if(Object.keys(sessions.list[name]).length > 10) $main.addClass("scroll");
                else $main.removeClass("scroll");
		
		utils.view("edit");
		$("#edit-text").val("").focus();
	}, function(name){
                var $list = $("#edit-saved-session")[0], tabs = [];
                
                name = $list.dataset.name;
		$.each($list.children, function(n, e){
                        if((!(e.style.opacity)) || (e.style.opacity > 0.9)) tabs.push(e.dataset.name);
		});
                
		sessions.list[name] = tabs;
		utils.view("main");
	}],
	
	remove: [function(name){
		utils.confirm("Are you sure you want to remove " + sessions.display(name) + "?");
	}, function(name){
		if (name === null) {
			delete sessions.temp;
		} else {
			delete sessions.list[name];
		}
		
		background._gaq.push(["_trackEvent", name === null ? "Temp" : "Session", "Remove"]);
	}],

	removeURL: [function(target){
		console.log("Remove " + target + "?");
                if(target.innerHTML == "+") {
                        target.innerHTML = "&times";
                        target.parentElement.style.opacity = "1";
                } else {
                        target.innerHTML = "+";
                        target.parentElement.style.opacity = ".3";
                }
	}],

	openURL: [function(target){
		chrome.windows.getCurrent(function(win){
			background.openSession(win.id, [target.title], e, false) !== false && window.close();
		});
	}],
	
	savetemp: [function(){
		utils.tabs(function(tabs){
			sessions.temp = tabs;
		});
		
		background._gaq.push(["_trackEvent", "Temp", "Save"]);
	}],
	
	save: [function(){
		var $name = $("#main-save-name"), name = state.name = $name.val().trim();
		
		if (name) {
			$name.val("");
			
			utils.action("replace", sessions.list[name] ? 2 : 1);
		}
	}]
};


/*** events ***/
$("body").on("focus", "*", function(){
	this.blur();
	
	$("body").off("focus", "*");
}).on("click keypress", "[data-view], [data-action]", function(e){
	if ((this.tagName === "BUTTON" && e.type === "keypress") || (this.tagName === "INPUT" && (e.type !== "keypress" || e.which !== 13))) {
		return;
	}
	
	"view" in this.dataset && utils.view(this.dataset.view);
	"action" in this.dataset && utils.action(this.dataset.action, this.dataset.actionindex);
});

$("#main-saved-list").on("click", "big, div > a:not([title])", function(){
	state.name = this.parentNode.dataset.name;
	
	utils.action(this.tagName === "BIG" ? "rename" : "remove");
}).on("click", "span > a", function(e){
	var action = this.textContent.toLowerCase(),
		name = state.name = this.parentNode.parentNode.dataset.name;
	
	if (action === "open") {
		chrome.windows.getCurrent(function(win){
			background.openSession(win.id, sessions.list[name], e, false) !== false && window.close();
		});
	} else {
		utils.action(action);
	}
}).on("click", "div > a[title]", function(e){
	state.name = this.parentNode.dataset.name;
	state.id = "";
        utils.action("edit");
});

$("#edit-saved-session").on("click", "big, div > a:not([title])", function(e){
	state.name = e.target;

	if (this.tagName === "BIG") {
		chrome.windows.getAll(function(wins) {
			for(var i = 0; i < wins.length; i++) if(wins[i].id == state.id) {
				i = wins.length + 5;
				chrome.tabs.create({windowId: state.id, url: e.target.title, active: true});
				chrome.windows.update(state.id, {focused: true});
			}
			if (i < wins.length + 5) chrome.windows.create({ url: e.target.title }, function(win) {
				state.id = win.id;
			}); 
		}); 
	} else utils.action("removeURL");
});

$("#main-saved-temp").on("click", "a:not([title])", function(e){
	var action = this.textContent.toLowerCase();
	state.name = null;
	
	if (action === "open") {
		chrome.windows.getCurrent(function(win){
			background.openSession(win.id, sessions.temp, e, true) !== false && window.close();
		});
	} else if (action.length === 1) {
		utils.action("remove");
	} else {
		utils.action(action);
	}
});

$("#import-file").change(function(){
	utils.action("import");
});


/*** init ***/
sessions.load();

if (localStorage.readchanges !== "true") {
	$("#main-changelog").show();
	
	localStorage.readchanges = true;
}

if (location.search) {
	$("#import [data-view]").click(function(){
		window.close();
		
		return false;
	});
	
	utils.view("import");
	
	background.ga("send", "pageview", "/import");
} else {
	background.ga("send", "pageview", "/popup");
}

})();
