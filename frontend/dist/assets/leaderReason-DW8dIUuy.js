var s=/^__missed__\|(\d{2}:\d{2})$/;function o(e,n){const t=s.exec(e||"");return t?String(n||"").replace("{time}",t[1]):e}export{o as t};
