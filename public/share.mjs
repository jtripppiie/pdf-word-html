export async function publishShare(html,name,previous){
 const updating=previous?.id&&previous?.deleteToken;
 const response=await fetch('/api/shares'+(updating?'/'+previous.id:''),{method:updating?'PUT':'POST',headers:{'Content-Type':'application/json',...(updating?{Authorization:'Bearer '+previous.deleteToken}:{})},body:JSON.stringify({html,name})});
 if(updating&&response.status===404)return publishShare(html,name);
 const result=await response.json();if(!response.ok)throw Error(result.error||'Could not share this conversion.');
 return {...previous,...result,url:new URL(result.path,location.origin).href};
}
export async function revokeShare(share){
 const response=await fetch('/api/shares/'+share.id,{method:'DELETE',headers:{Authorization:'Bearer '+share.deleteToken}});
 if(!response.ok&&response.status!==404)throw Error((await response.json()).error||'Could not stop sharing.');
}
