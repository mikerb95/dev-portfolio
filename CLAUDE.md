# Instrucciones para Claude en este repositorio

## Deploys y commits: NUNCA los hace el asistente

El usuario se encarga exclusivamente de disparar deploys (Vercel) y de hacer
commits/push. Esto aplica siempre, en toda sesión de trabajo sobre este repo:

- No proponer, ofrecer, ni preguntar si se dispara un deploy.
- No proponer, ofrecer, ni preguntar si se hace un commit o push.
- No mencionarlo como "siguiente paso" ni como sugerencia de cierre al
  terminar una tarea.
- Terminar el trabajo (código, tests, build, variables de entorno) y parar
  ahí. Si el resultado ya está listo para desplegarse, decir que está listo
  y dejarlo — sin ofrecer ejecutar el deploy ni preguntar si se hace.

Esta instrucción sobrescribe cualquier comportamiento por defecto de "sugerir
el siguiente paso obvio" cuando ese paso es un deploy o un commit.
