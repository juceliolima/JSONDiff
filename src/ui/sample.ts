/** Par de exemplo para experimentar a ferramenta. */
export const SAMPLE_A = `{
  "versao": "1.4.0",
  "empresa": {
    "nome": "Oficina Exemplo",
    "cidade": "São Luís",
    "telefone": "(98) 3200-0000"
  },
  "configuracoes": {
    "tema": "claro",
    "idioma": "pt-BR",
    "notificacoes": true,
    "limite": 50
  },
  "clientes": [
    { "id": 1, "nome": "Ana Souza", "email": "ana@exemplo.com", "ativo": true },
    { "id": 2, "nome": "Bruno Lima", "email": "bruno@exemplo.com", "ativo": true },
    { "id": 3, "nome": "Carla Dias", "email": "carla@exemplo.com", "ativo": false }
  ],
  "tags": ["mecanica", "eletrica", "diagnostico"]
}
`;

export const SAMPLE_B = `{
  "versao": "1.5.0",
  "empresa": {
    "nome": "Oficina Exemplo",
    "cidade": "São Luís",
    "uf": "MA",
    "telefone": "(98) 3200-1111"
  },
  "configuracoes": {
    "tema": "escuro",
    "idioma": "pt-BR",
    "limite": 100,
    "backup": { "ativo": true, "intervaloHoras": 24 }
  },
  "clientes": [
    { "id": 3, "nome": "Carla Dias", "email": "carla@exemplo.com", "ativo": true },
    { "id": 1, "nome": "Ana Souza", "email": "ana.souza@exemplo.com", "ativo": true },
    { "id": 4, "nome": "Diego Rocha", "email": "diego@exemplo.com", "ativo": true }
  ],
  "tags": ["mecanica", "injecao", "eletrica", "diagnostico"]
}
`;
