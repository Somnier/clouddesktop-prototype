async function step(){
  const r=await fetch('http://localhost:3920/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'advance-story',payload:{}})}).then(r=>r.json());
  const d=await fetch('http://localhost:3920/api/state').then(r=>r.json());
  const m=d.terminals.find(t=>t.id===d.demo.motherId);
  const cr=d.classrooms.find(c=>c.id===d.demo.focusClassroomId);
  return{screen:m.screen,ctrl:m.controlState,stage:cr.stage,deployStep:d.demo.deployDraft?.step,desktops:m.desktops?.length};
}
async function go(){
  // reset first
  await fetch('http://localhost:3920/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'reset',payload:{}})});
  for(let i=0;i<12;i++){
    const s=await step();
    console.log('Step'+(i+1)+':', JSON.stringify(s));
  }
}
go();
