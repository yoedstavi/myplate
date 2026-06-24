# MyPlate
## Multitask like a machine!
This project is intended to assist you in multitasking.  
Have this open in the background and use it whenever you have to decide what's next.  
It should help you get an instant overview, make good decisions and reduce stress.  

## How to build from source
### Prerequisites
- Node.js
- Git (with Git Bash in Windows)
### Steps
Clone the repo  
Open a bash shell in the project's root directory (git bash in Windows)
```bash
npm install --save-dev @electron-forge/cli
npx electron-forge import
rm forge.config.js    # apparently a bug, the correct file is forge.config.ts
npm start             # test running as a dev
```

### Package as a redistributable
```bash
npm run make
```

## Data
The data is saved in a file named `tasks.json`. The file is located in the working directory of the program (created if missing).  
The file should not be modified manually. There are no integrity tests or attempts of recovery.

