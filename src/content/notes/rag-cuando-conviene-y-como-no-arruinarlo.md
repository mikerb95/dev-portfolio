---
title: RAG — cuándo conviene y cómo no arruinarlo
description: Retrieval-Augmented Generation no es magia ni un reemplazo del fine-tuning. Es una decisión de arquitectura con trade-offs claros — y la mayoría de los fracasos ocurren en la recuperación, no en el modelo.
date: 2026-07-09
tags: [rag, llm, arquitectura, ia]
---

Cada vez que alguien quiere que un LLM "sepa" sobre sus propios datos, aparece la misma bifurcación: ¿reentreno el modelo o le doy la información en el momento de la pregunta? La segunda opción es RAG — Retrieval-Augmented Generation — y en la enorme mayoría de los casos es la respuesta correcta. No porque esté de moda, sino porque los trade-offs casi siempre caen de su lado.

La idea es simple hasta el aburrimiento: cuando llega una pregunta, buscas primero los fragmentos de tu conocimiento más relevantes, los pegas en el prompt, y dejas que el modelo responda usándolos. El LLM no memoriza nada — razona sobre texto que le acabas de entregar. Esa separación entre *saber* y *razonar* es toda la ventaja.

## Por qué no fine-tuning (casi nunca)

El fine-tuning parece la opción seria, pero para "que el modelo conozca mis documentos" suele ser la trampa cara:

- **Los datos cambian.** Actualizar un documento en RAG es reemplazar una fila. En fine-tuning es reentrenar. Si tu conocimiento tiene fecha de caducidad — y casi todo la tiene — RAG gana solo.
- **No hay citas.** Un modelo afinado te da una respuesta segura sin decirte de dónde salió. RAG te devuelve *qué fragmento* la sustenta, y eso es auditable. Para cualquier cosa que un cliente vaya a creer, la trazabilidad no es opcional.
- **Alucina igual.** Fine-tuning enseña estilo y formato, no hechos confiables. Si el objetivo es que no invente, meter el hecho en el contexto es más efectivo que esperar que lo haya interiorizado.

El fine-tuning sigue siendo la herramienta correcta para *comportamiento*: tono, formato estructurado, un dominio muy específico de razonamiento. Para *conocimiento*, RAG.

## El fracaso siempre está en la recuperación

Aquí está lo que nadie te dice cuando empiezas: si tu RAG responde mal, el problema casi nunca es el LLM. Es que le entregaste los fragmentos equivocados. Basura entra, basura sale — y ningún modelo, por bueno que sea, arregla un contexto que no contiene la respuesta.

Los tres puntos donde se rompe, en orden de frecuencia:

**Chunking.** Cortar los documentos en trozos es la decisión más subestimada del pipeline. Chunks demasiado grandes diluyen la señal y desperdician contexto; demasiado pequeños parten una idea a la mitad y ninguno de los dos fragmentos tiene sentido solo. Cortar por estructura semántica — párrafos, secciones — casi siempre le gana a cortar cada N caracteres a ciegas.

**Recuperación puramente semántica.** La búsqueda por embeddings entiende significado, pero es sorprendentemente mala con nombres exactos, códigos de error o identificadores. Buscar "error TTL_EXPIRED" por similitud vectorial puede no encontrar el documento que lo menciona literalmente. La solución barata es búsqueda híbrida: combinar embeddings con búsqueda por palabra clave (BM25) y quedarte con lo mejor de ambas.

**Sin evaluación.** El error más caro es no medir la recuperación por separado. Antes de culpar al modelo, pregunta: de las respuestas correctas, ¿el fragmento necesario estaba entre los recuperados? Si no estaba, el generador nunca tuvo una oportunidad. Medir *recall* de recuperación aislado del LLM es lo que convierte "esto no funciona" en "esto falla en el paso 2".

## El diseño mínimo honesto

Un RAG que se sostiene en producción no es más que esto: documentos cortados con criterio, embeddings guardados en un índice vectorial, búsqueda híbrida en la consulta, un reordenamiento de los candidatos por relevancia, y un prompt que le ordena al modelo responder **solo** con lo recuperado — y admitir cuando no hay respuesta en el contexto.

Esa última instrucción es la que separa un asistente confiable de un generador de plausibilidades. Un RAG que prefiere decir "no tengo esa información" antes que inventar es, para un cliente, infinitamente más valioso que uno que siempre suena seguro. La confianza no se construye respondiendo todo: se construye no mintiendo.
