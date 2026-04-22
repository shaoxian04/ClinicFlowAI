package my.cliniflow.controller.biz.visit.request;

import jakarta.validation.constraints.NotBlank;

public record NotesTextRequest(@NotBlank String text) {}
