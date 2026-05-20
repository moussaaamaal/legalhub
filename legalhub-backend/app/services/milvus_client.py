import logging
from pymilvus import connections, Collection, CollectionSchema, FieldSchema, DataType, utility
from app.core.config import settings

logger = logging.getLogger(__name__)

COLLECTION_NAME = settings.MILVUS_COLLECTION_NAME
DIM = settings.EMBEDDING_DIMENSION


def connect_milvus():
    try:
        connections.connect(alias="default", host=settings.MILVUS_HOST, port=settings.MILVUS_PORT)
    except Exception as e:
        logger.error(f"Milvus connection failed: {e}")
        raise


def get_or_create_collection() -> Collection:
    connect_milvus()

    if utility.has_collection(COLLECTION_NAME):
        col = Collection(COLLECTION_NAME)
        col.load()
        return col

    fields = [
        FieldSchema(name="id",          dtype=DataType.VARCHAR, max_length=128, is_primary=True),
        FieldSchema(name="firm_id",     dtype=DataType.VARCHAR, max_length=64),
        FieldSchema(name="case_id",     dtype=DataType.VARCHAR, max_length=64),
        FieldSchema(name="source_type", dtype=DataType.VARCHAR, max_length=32),
        FieldSchema(name="source_id",   dtype=DataType.VARCHAR, max_length=64),
        FieldSchema(name="chunk_text",  dtype=DataType.VARCHAR, max_length=4096),
        FieldSchema(name="embedding",   dtype=DataType.FLOAT_VECTOR, dim=DIM),
    ]
    schema = CollectionSchema(fields, description="LegalHub case knowledge chunks")
    col = Collection(COLLECTION_NAME, schema)

    col.create_index("embedding", {
        "metric_type": "COSINE",
        "index_type": "HNSW",
        "params": {"M": 16, "efConstruction": 256},
    })
    col.load()
    logger.info(f"Milvus collection '{COLLECTION_NAME}' created and loaded.")
    return col
