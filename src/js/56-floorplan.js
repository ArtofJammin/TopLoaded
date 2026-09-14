  /* Marketfloor-inspired local guide. No external event's bookings are copied. */
  TL.floorplan = (function(){
    var labels = {tcg:"TCG",sports:"Sports",mixed:"Mixed",unassigned:"Vendor to be announced",food:"Food",entry:"Entry"};
    function stats(booths){
      var counts = {tcg:0,sports:0,mixed:0};
      (booths || []).forEach(function(b){ if(b && Object.prototype.hasOwnProperty.call(counts,b.type)) counts[b.type]++; });
      var total = counts.tcg + counts.sports + counts.mixed, pct = {}, rest = 100;
      var keys = Object.keys(counts).filter(function(k){ return counts[k]; });
      keys.forEach(function(k,i){ pct[k] = i === keys.length-1 ? rest : Math.round(counts[k]/total*100); rest -= pct[k]; });
      return {counts:counts,total:total,pct:pct};
    }
    function fits(b,size){return b.r>=1 && b.c>=1 && b.w>=1 && b.h>=1 && b.r+b.h-1<=size.rows && b.c+b.w-1<=size.cols;}
    function overlaps(a,b){return a.c<b.c+b.w && b.c<a.c+a.w && a.r<b.r+b.h && b.r<a.r+a.h;}
    function canPlace(booths,b,size,skip){return fits(b,size) && !booths.some(function(other,i){return i!==skip && overlaps(b,other);});}
    function roomMetrics(room,rows,cols){
      var hilton=room==='hilton-ballroom';
      return {hilton:hilton,row:hilton?64*cols/rows*41/96:64,gap:hilton?0:6,widthFt:hilton?96:null,heightFt:hilton?41:null};
    }
    function layout(map,room,size){
      var m=roomMetrics(room,size.rows,size.cols);
      map.dataset.rows=size.rows;map.dataset.cols=size.cols;map.dataset.rowBase=m.row;map.dataset.baseGap=m.gap;
      map.classList.toggle('is-hilton',m.hilton);
      map.style.gridTemplateColumns='repeat('+size.cols+', var(--fp-cell))';map.style.gridTemplateRows='repeat('+size.rows+', var(--fp-row, var(--fp-cell)))';
      return m.hilton?'Triple Crown Ballroom · 96 × 41 ft. Each grid allocation is '+(96/size.cols).toFixed(1)+' × '+(41/size.rows).toFixed(1)+' ft. Booth placements are organizer-entered, not surveyed.':'Custom schematic · grid positions have no physical scale.';
    }
    function viewport(root,map,scroll){
      var zoom=1,drag=null,fitMode=true;
      function setZoom(z){
        var old=zoom; zoom=Math.max(.015,Math.min(2.5,z));
        var x=(scroll.scrollLeft+scroll.clientWidth/2)/old,y=(scroll.scrollTop+scroll.clientHeight/2)/old;
        map.style.setProperty('--fp-cell',(64*zoom)+'px');map.style.setProperty('--fp-row',((Number(map.dataset.rowBase)||64)*zoom)+'px');map.style.setProperty('--fp-gap',((Number(map.dataset.baseGap)||0)*zoom)+'px');
        map.classList.toggle('is-dense',zoom<.6);
        scroll.scrollLeft=x*zoom-scroll.clientWidth/2;scroll.scrollTop=y*zoom-scroll.clientHeight/2;
      }
      function fit(){
        if(!scroll.clientWidth) return;
        var cols=Number(map.dataset.cols)||10,rows=Number(map.dataset.rows)||6;
        var gap=Number(map.dataset.baseGap)||0,row=Number(map.dataset.rowBase)||64;
        setZoom(Math.min(1,(scroll.clientWidth-32)/(cols*64+(cols-1)*gap),(scroll.clientHeight-32)/(rows*row+(rows-1)*gap)));
        scroll.scrollLeft=scroll.scrollTop=0;fitMode=true;
      }
      function focus(el){
        if(!el) return;
        /* Center within this map, without scrolling the entire page. */
        var a=el.getBoundingClientRect(),b=scroll.getBoundingClientRect();
        scroll.scrollLeft+=a.left-b.left-(scroll.clientWidth-a.width)/2;
        scroll.scrollTop+=a.top-b.top-(scroll.clientHeight-a.height)/2;
      }
      root.addEventListener('click',function(e){
        var b=e.target.closest('[data-floor-zoom]');if(!b) return;
        var k=b.dataset.floorZoom;if(k==='fit') fit();else{fitMode=false;setZoom(zoom*(k==='in'?1.3:1/1.3));}
      });
      scroll.addEventListener('wheel',function(e){if(!e.ctrlKey)return;e.preventDefault();fitMode=false;setZoom(zoom*(e.deltaY<0?1.12:1/1.12));},{passive:false});
      scroll.addEventListener('pointerdown',function(e){
        if(e.pointerType==='touch'||e.button!==0||e.target.closest('.fp-cell')||map.classList.contains('is-placing'))return;
        drag={x:e.clientX,y:e.clientY,left:scroll.scrollLeft,top:scroll.scrollTop,id:e.pointerId};scroll.setPointerCapture(e.pointerId);scroll.classList.add('is-panning');
      });
      scroll.addEventListener('pointermove',function(e){if(!drag||e.pointerId!==drag.id)return;scroll.scrollLeft=drag.left+drag.x-e.clientX;scroll.scrollTop=drag.top+drag.y-e.clientY;});
      function stop(){drag=null;scroll.classList.remove('is-panning');}
      scroll.addEventListener('pointerup',stop);scroll.addEventListener('pointercancel',stop);scroll.addEventListener('lostpointercapture',stop);
      map.addEventListener('focusin',function(e){var b=e.target.closest('.fp-cell');if(b)focus(b);});
      if(typeof ResizeObserver!=='undefined')new ResizeObserver(function(){if(fitMode)fit();}).observe(scroll);
      return {fit:fit,focus:focus,refresh:function(){if(fitMode)fit();else setZoom(zoom);}};
    }
    var publicBooths=[],selected=-1,publicView=null;
    function match(b){var q=($('#floorSearch').value||'').trim().toLowerCase(),type=$('#floorType').value;return (!type||b.type===type)&&(!q||(b.label+' '+b.id+' '+labels[b.type]).toLowerCase().includes(q));}
    function details(i){
      var b=publicBooths[i];selected=b?i:-1;
      $('#showFloorDetail').innerHTML=b?'<p class="eyebrow">'+esc(labels[b.type])+'</p><h3>'+esc(b.label)+'</h3><p>'+(b.type==='unassigned'?'The vendor for this position has not been announced for this show. This is not a table availability or reservation offer.':'Find this location in the highlighted area of the map.')+'</p>':'<h3>Explore the floor</h3><p>Choose a table on the map or in the directory.</p>';
      $$('#showFloorGuide [data-floor-booth]').forEach(function(el){el.setAttribute('aria-pressed',String(Number(el.dataset.floorBooth)===selected));});
    }
    function filter(){
      var count=0;
      publicBooths.forEach(function(b,i){var yes=match(b);if(yes)count++;var cell=$('#showFloorMap [data-floor-booth="'+i+'"]');cell.classList.toggle('is-muted',!yes);cell.disabled=!yes;cell.setAttribute('aria-hidden',String(!yes));});
      $('#showFloorList').innerHTML=publicBooths.map(function(b,i){return match(b)?'<li><button type="button" data-floor-booth="'+i+'" aria-pressed="'+(i===selected)+'"><span class="floor-swatch t-'+b.type+'" aria-hidden="true"></span><span><b>'+esc(b.label)+'</b><small>'+labels[b.type]+' · Row '+b.r+', column '+b.c+'</small></span><span aria-hidden="true">↗</span></button></li>':'';}).join('');
      $('#floorResults').textContent=count+' of '+publicBooths.length+' locations shown'+(!count?' — try another name or category.':'.');
      if(selected>=0&&!match(publicBooths[selected]))details(-1);
    }
    function render(){
      var selectedId=publicBooths[selected]&&publicBooths[selected].id;
      var f = (TL.config.show || {}).floorplan || {}, rows = Number(f.rows)||6, cols = Number(f.cols)||10;
      var booths = (Array.isArray(f.booths) ? f.booths : []).filter(function(b){return b && labels[b.type] && b.r>=1 && b.c>=1 && b.w>=1 && b.h>=1 && b.r+b.h-1<=rows && b.c+b.w-1<=cols;});
      var map=$("#showFloorMap"), note=$("#showFloorNote"), mix=$("#showFloorMix"), legend=$("#showFloorLegend"), list=$("#showFloorList"), scroll=$("#showFloorScroll");
      if(!map) return;
      $('#showVenueReference').hidden=!/hilton/i.test(String((TL.config.show||{}).venue));
      var guide=$('#showFloorGuide');guide.hidden=!booths.length;
      scroll.hidden = !booths.length; mix.hidden = !booths.length;
      if(!booths.length){ note.textContent="The vendor layout is not published yet. Check back for the confirmed TCG and Sports booth locations and percentages."; map.innerHTML=legend.innerHTML=list.innerHTML=mix.innerHTML="";publicBooths=[];selected=-1;return; }
      var s=stats(booths);
      var pending=booths.filter(function(b){return b.type==='unassigned';}).length;
      note.textContent=s.total?s.total+" assigned vendor booths · TCG/Sports percentages are by assigned booth, not floor area. Mixed vendors are separate."+(pending?' '+pending+' assignments to follow.':''):"Marketfloor table layout · vendor assignments for this show are to be announced. TCG/Sports percentages will appear as vendors are assigned. Positions are subject to organizer confirmation.";
      mix.hidden=!s.total;
      layout(map,f.room,{rows:rows,cols:cols});
      $('#floorScaleNote').textContent=f.room==='hilton-ballroom'?'Triple Crown Ballroom · 96 × 41 ft · table-layout guide':'Organizer’s table-layout guide';
      map.innerHTML=booths.map(function(b,i){return '<button type="button" class="fp-cell t-'+b.type+'" data-floor-booth="'+i+'" aria-pressed="false" aria-label="'+esc(b.label+' · '+labels[b.type]+', row '+b.r+', column '+b.c)+'" title="'+esc(b.label+' · '+labels[b.type])+'" style="grid-row:'+b.r+' / span '+b.h+';grid-column:'+b.c+' / span '+b.w+'"><b>'+esc(b.label)+'</b><i>'+labels[b.type]+'</i></button>';}).join("");
      mix.innerHTML=Object.keys(s.pct).map(function(k){return '<span class="t-'+k+'" style="width:'+s.pct[k]+'%"></span>';}).join("");
      legend.innerHTML=Object.keys(labels).filter(function(k){return booths.some(function(b){return b.type===k;});}).map(function(k){return '<li><i class="t-'+k+'" aria-hidden="true"></i>'+labels[k]+(s.pct[k]!==undefined?' '+s.pct[k]+'% ('+s.counts[k]+')':'')+'</li>';}).join("");
      publicBooths=booths;details(booths.findIndex(function(b){return b.id===selectedId;}));filter();
      $$('#showFloorMap [data-floor-booth]').forEach(function(el,i){el.classList.toggle('is-vertical',booths[i].h>booths[i].w);});
      if(!publicView){
        publicView=viewport(guide,map,scroll);
        $('#floorSearch').addEventListener('input',filter);$('#floorType').addEventListener('change',filter);
        guide.addEventListener('click',function(e){var b=e.target.closest('[data-floor-booth]');if(!b)return;var i=Number(b.dataset.floorBooth);details(i);publicView.focus($('#showFloorMap [data-floor-booth="'+i+'"]'));});
      }
      publicView.refresh();
    }
    TL.on("init",render); TL.on("config:change",render);
    TL.on('view:change',function(d){if(d.name==='show'&&publicView)requestAnimationFrame(function(){publicView.refresh();});});
    return {stats:stats,render:render,viewport:viewport,fits:fits,overlaps:overlaps,canPlace:canPlace,layout:layout,roomMetrics:roomMetrics};
  })();
