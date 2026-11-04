# Arquitetura MVC — Tech Peças IA

O backend do Tech Peças IA está sendo organizado no padrão MVC para separar responsabilidades e facilitar manutenção, testes e evolução do projeto.

## Estrutura

```text
src/
├── config/
│   └── database.js
├── models/
│   ├── UserModel.js
│   ├── VehicleModel.js
│   ├── CatalogModel.js
│   └── HistoryModel.js
├── controllers/
│   ├── authController.js
│   ├── vehicleController.js
│   ├── catalogController.js
│   └── historyController.js
├── routes/
│   ├── authRoutes.js
│   ├── vehicleRoutes.js
│   ├── catalogRoutes.js
│   ├── historyRoutes.js
│   └── systemRoutes.js
├── middleware/
│   └── authMiddleware.js
└── utils/
    └── text.js
```

## Responsabilidades

### Model
Responsável pelo acesso e persistência de dados no MySQL.

Exemplos:
- usuários e sessões;
- veículos da garagem;
- catálogo e compatibilidades;
- histórico de buscas.

### Controller
Recebe a requisição HTTP, valida os dados, chama o Model e devolve a resposta ao cliente.

### Routes
Define os endpoints da API e conecta cada rota ao Controller correspondente.

### Middleware
Executa validações compartilhadas antes dos Controllers.

Exemplos:
- autenticação;
- autorização de administrador;
- bloqueio de compra para contas administrativas.

### Config
Centraliza configurações compartilhadas, como a conexão MySQL.

## Fluxo MVC

```text
Frontend
   ↓
Route
   ↓
Middleware
   ↓
Controller
   ↓
Model
   ↓
MySQL
```

As integrações externas, como Gemini, SerpApi e Asaas, devem permanecer fora dos Models e ser tratadas como Services.

```text
Controller
   ├── Model → MySQL
   └── Service → API externa
```

## Módulos já migrados

- Autenticação
- Sessão e autorização
- Garagem / veículos
- Catálogo
- Histórico
- Health check

Os módulos mais sensíveis do protótipo podem ser migrados de forma incremental para evitar regressões durante o desenvolvimento.
