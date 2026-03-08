fetch("http://localhost:3000/api/pdf/Taynara%20Reges", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
        mes: 3,
        ano: 2026,
        dadosCalculo: {
            idProfessorEvo: "Taynara",
            nomeProfessor: "Taynara",
            percentual: 30,
            turmas: [],
            totalGeralNoMes: 0
        }
    })
})
    .then(r => {
        console.log("STATUS:", r.status);
        return r.text();
    })
    .then(text => console.log("BODY LEN:", text.length))
    .catch(console.error);
