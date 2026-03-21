from __future__ import annotations

import re


def approximate_token_count(text: str) -> int:
    return int(len(re.split(r"\s+", text.strip())) * 1.3)


def _split_sentences(text: str) -> list[str]:
    return [s for s in re.split(r"(?<=[.!?])\s+", text.strip()) if s]


def _words_for_tokens(token_count: int) -> int:
    return max(1, int(token_count / 1.3))


def _get_overlap_tail(sentences: list[str], overlap_tokens: int) -> tuple[list[str], int]:
    tail: list[str] = []
    token_count = 0
    for sentence in reversed(sentences):
        sentence_tokens = approximate_token_count(sentence)
        if token_count + sentence_tokens > overlap_tokens:
            break
        tail.insert(0, sentence)
        token_count += sentence_tokens
    return tail, token_count


def chunk_text(text: str, chunk_size: int = 800, overlap: int = 100) -> list[str]:
    if not text.strip():
        return []

    sentences = _split_sentences(text)
    if not sentences:
        return []

    chunks: list[str] = []
    current_sentences: list[str] = []
    current_tokens = 0

    for sentence in sentences:
        sentence_tokens = approximate_token_count(sentence)

        if sentence_tokens > chunk_size:
            if current_sentences:
                chunks.append(" ".join(current_sentences))
                overlap_tail, overlap_count = _get_overlap_tail(current_sentences, overlap)
                current_sentences = overlap_tail
                current_tokens = overlap_count

            words = [w for w in re.split(r"\s+", sentence) if w]
            word_chunk: list[str] = []
            word_tokens = 0

            for word in words:
                next_word_tokens = approximate_token_count(word)
                if word_tokens + next_word_tokens > chunk_size and word_chunk:
                    chunks.append(" ".join(word_chunk))
                    word_chunk = word_chunk[-_words_for_tokens(overlap):]
                    word_tokens = approximate_token_count(" ".join(word_chunk))
                word_chunk.append(word)
                word_tokens += next_word_tokens

            if word_chunk:
                current_sentences = [" ".join(word_chunk)]
                current_tokens = approximate_token_count(current_sentences[0])
            continue

        if current_tokens + sentence_tokens > chunk_size and current_sentences:
            chunks.append(" ".join(current_sentences))
            overlap_tail, overlap_count = _get_overlap_tail(current_sentences, overlap)
            current_sentences = overlap_tail
            current_tokens = overlap_count

        current_sentences.append(sentence)
        current_tokens += sentence_tokens

    if current_sentences:
        chunks.append(" ".join(current_sentences))

    return chunks
