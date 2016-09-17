function Main() {
}
Main.prototype.init = function() {

  this.diffNext = 74; // j key
  this.diffPrev = 75; // k key

  this.commentNext = 78; // n key
  this.commentPrev = 80; // p key

  this.toggleSidebar = 90; // z key

  this.hiddenSidebarUrls = [];
  this.pageLoadWaitTimeout = 1000; // 1 sec

  // Add the notice
  $("body").prepend('<div id="jk-notice">No diffs found</div>');
  $('#jk-notice').css("background-color", $('body').css('background-color'));

  var that = this;

  if (typeof chrome != "undefined") {
    
    chrome.storage.local.get("hotkeys", function(items){
      if (items.hasOwnProperty('hotkeys')) {
        that.updateHotkeys(items.hotkeys);
      }
    });

    chrome.storage.onChanged.addListener(function(changes, namespace) {
      if (changes.hasOwnProperty('hotkeys')) {
        that.updateHotkeys(changes.hotkeys.newValue);
      }
    });
  }

  this.generateFileHierarchy();

  if (window == top) {
    window.addEventListener('keyup', this.doKeyPress.bind(this), false);
    setInterval(this.monitorUrlChange.bind(this), 100);
  }
};

Main.prototype.updateHotkeys = function(hotkeys) {
  this.diffNext = hotkeys.diffNext;
  this.diffPrev = hotkeys.diffPrev;
  this.commentNext = hotkeys.commentNext;
  this.commentPrev = hotkeys.commentPrev;
  this.toggleSidebar = hotkeys.toggleSidebar;
};

Main.prototype.generateFileHierarchy = function() {

  this.currentPageUrl = this.getWindowLocationHref();
  this.currentFileId = null;
  this.currentCommentId = null;
  this.cnt = 0;

  this.files = this.getFiles();
  this.toolBarHeight = $('.pr-toolbar').height();

  var hierarchy = $('<p id="jk-hierarchy"></p>');
  var structure = this.getHierarchyStructure();
  var compressedStructure = main.compressHierarchy(structure);

  this.generateFileHierarchyHtml(hierarchy, compressedStructure);

  $("body").prepend(hierarchy);

  this.updateCurentDiffPos();
  this.appendCommentCounts();

  $('#jk-hierarchy').css('width', $('#jk-hierarchy').width() * 1.2);
  $('#jk-hierarchy').css("background-color", $('body').css('background-color'));
  // Hide the sidebar by default.
  $('#jk-hierarchy').hide();
  
  // Add some bottom margin for the last diff so scrollTo can reach it in 
  // case the diff is very small.
  var lastDiff = $('.file')[$('.file').length - 1];
  if (lastDiff && $(lastDiff).height() < $(window).height()) {
    var newMargin = $(window).height() - $(lastDiff).height() - this.toolBarHeight - 100;
    if (newMargin > 0) {
      $(lastDiff).css('margin-bottom', newMargin);  
    }
  }

  $('#jk-hierarchy').find('.folder').click(function () {
    $header = $(this);
    $content = $header.next();
    $content.slideToggle(10, function () {
      $header.toggleClass('collapsed');
    });
  });

  var that = this;

  $('#jk-hierarchy').find('.jk-file').click(function () {
    that.scrollTo($('#' + $(this).data('file-id')));
    that.currentFileId = $(this).data('file-id').split('-')[1];
  });
  

};

Main.prototype.appendCommentCounts = function() {
  var files = $('#jk-hierarchy').find('.jk-file');
  $.each(files, function(key, item) {

    var fileId = $(item).data('file-id');

    var comments = $('#' + fileId).find('.js-comment');
    if (comments.length) {
      var count = $('<span class="comment-count"> (' + comments.length + ')</span>');
      $(item).append(count);
    }

  });
};

Main.prototype.generateFileHierarchyHtml = function(hierarchy, structure) {

  var list = $(document.createElement('ul'));

  var that = this;
  
  $.each(structure, function(index, file) {

    var label = (typeof file == 'string') ? file : index;
    
    var item = $('<li>' + label + '</li>');
      
    if (typeof structure[index] === 'object') {
      item.addClass('folder');
    }
    else if (typeof structure[index] === 'string') {
      item = $('<li><span class="file-name">' + label + '</span></li>');
      item.addClass('jk-file');
      item.attr("data-file-id", "diff-" + that.cnt);
      that.cnt = that.cnt + 1;
    }

    
    list.append(item);
    hierarchy.append(list);
    
    if (typeof structure[index] === 'object') {
      that.generateFileHierarchyHtml(list, structure[index]);
    }

  });  
}

Main.prototype.doKeyPress = function(e) {

  // Do not react on key press if user is typing text.
  var clickedTarget = $(e.target).prop("tagName");
  if (clickedTarget != 'BODY' && clickedTarget != undefined) {
    return;
  }

  if (e.keyCode == this.diffNext || e.keyCode == this.diffPrev) {
    this.updateCurrentPos(e.keyCode);
    var el = this.getCurrentEl();
    this.scrollTo(el);
  }

  if (e.keyCode == this.commentNext || e.keyCode == this.commentPrev) {
    this.updateCurrentCommentPos(e.keyCode);
    var el = this.getCurrentCommentEl();
    this.scrollTo(el);
  }

  if (e.keyCode == this.toggleSidebar) {
    
    // If the sidebar does not exist, re-generate it.
    if (!this.isSidebarHaveContents()) {
      $('#jk-hierarchy').remove();
      this.generateFileHierarchy();
    }
    
    if (this.isSidebarHaveContents()) {
      $('#jk-hierarchy').toggle();  
    }
    else {
      $("#jk-notice").show().delay(600).fadeOut(600);
    }
    
  }
  
};

Main.prototype.getHierarchyStructure = function() {
  var result = {};
  var files = this.files.find('.user-select-contain');
  var addProp = this.addProp.bind(this);
  $.each(files, function(index, file) {
    var parts = $(file).attr('title').split('/');

    addProp(result, parts);
  });

  return result;
};

Main.prototype.addProp = function(res, arr) {

  if (arr.length == 1) {
    var fname = arr.splice(0,1);
    res[fname[0]] = fname[0];
    return;
  }

  if (arr.length > 1) {
    var prop = arr.splice(0,1);

    if (!res.hasOwnProperty(prop)) {
      res[prop] = {};  
    }

    this.addProp(res[prop], arr);
  }

};

Main.prototype.compressHierarchy = function(hierarchy) {
  var newObj = {};
  var path = "";

  traverse(hierarchy, newObj, path);

  return newObj;

  function traverse(obj, newObj, path) {
    for(var key in obj) {

      if (!path || typeof obj[key] != 'string') {
        path = path + String(key) + '/';
      }

      if (typeof obj[key] == 'string') {
        
        if (Object.keys(obj).length == 1) {
          newObj[path] = {};
          newObj[path][String(key) + '/'] = obj[key];
        }
        else {
          newObj[path] = obj[key];
        }
        
        path = "";
        continue;
      }

      if (typeof obj[key] == 'object' && Object.keys(obj[key]).length > 1) {
        newObj[path] = {};
        traverse(obj[key], newObj[path], "");
        path = "";
        continue;
      }
      
      traverse(obj[key], newObj, path);
      
      path = "";
      
    }
  }
};

Main.prototype.getCurrentEl = function() {
  return this.files[this.currentFileId];
};


Main.prototype.updateCurrentPos = function(keyCode) {
  if (this.currentFileId == null) {
    this.currentFileId = 0;
  }
  else if (this.currentFileId < this.files.length - 1 && keyCode == this.diffNext) {
   this.currentFileId++; 
  }
  else if (this.currentFileId > 0 && keyCode == this.diffPrev) {
   this.currentFileId--; 
  }
};


Main.prototype.updateCurrentCommentPos = function(keyCode) {
  if (this.currentCommentId == null) {
    this.currentCommentId = 0;
  }
  else if (this.currentCommentId < this.getComments().length - 1 && keyCode == this.commentNext) {
   this.currentCommentId++; 
  }
  else if (this.currentCommentId > 0 && keyCode == this.commentPrev) {
   this.currentCommentId--; 
  }
};


Main.prototype.getCurrentCommentEl = function() {
  return this.getComments()[this.currentCommentId];
};


Main.prototype.scrollTo = function(el) {

  if (!$(el).length) return;

  var that = this;
  var offTop = $(el).offset().top - this.toolBarHeight - 10;
  
  $('body').scrollTop(offTop);
  that.updateCurentDiffPos();

};

Main.prototype.updateCurentDiffPos = function() {
  var id = null;
  
  if (!this.getFiles) return;

  $.each(this.getFiles(), function(key, file) {    
    var rect = file.getBoundingClientRect();
    if (rect.top < 139) {
      id = $(file).attr("id");
    }
  });

  $('#jk-hierarchy').find('.jk-file.current').removeClass('current');
  $('#jk-hierarchy').find('.jk-file*[data-file-id="' + id + '"]').addClass('current');


  if ($('#jk-hierarchy').is(":visible") && $('#jk-hierarchy').find('.jk-file.current').is(":visible")) {
    while (isAbove()) {
      $('#jk-hierarchy').scrollTop($('#jk-hierarchy').scrollTop() - 10);  
    }

    while (isBelow()) {
      $('#jk-hierarchy').scrollTop($('#jk-hierarchy').scrollTop() + 10);  
    }  
  }
    

  function isAbove() {
    var pos = $('#jk-hierarchy').find('.jk-file.current').position();
    return pos && pos.top < 0;
  }

  function isBelow() {
    var pos = $('#jk-hierarchy').find('.jk-file.current').position();
    return pos && pos.top > $('#jk-hierarchy').height();
  }
  
};

Main.prototype.getFiles = function() {
  return $('.file');
};


Main.prototype.getComments = function() {
  return $('#files .js-comment');
};

Main.prototype.monitorUrlChange = function() {
  // If URL changed, remove the sidebar.
  if (!this.isSameUrl()) {
    this.currentPageUrl = this.getWindowLocationHref();
    $('#jk-hierarchy').remove();
  }
  
};

Main.prototype.isSameUrl = function() {
  return this.currentPageUrl == this.getWindowLocationHref();
};

Main.prototype.getWindowLocationHref = function() {
  return window.location.href.split("#")[0];
};

Main.prototype.isSidebarHiddenOnCurrentPage = function() {
  return $.inArray(this.currentPageUrl, this.hiddenSidebarUrls) != -1;
};

Main.prototype.isSidebarHaveContents = function() {
  return $('#jk-hierarchy').length && $('#jk-hierarchy')[0].innerHTML;
};
